/**
 * 학생 CSV 일괄 등록·갱신 (AUTH-03, ADM-01, 3.1)
 *  - parseStudentCsv : 순수 함수. 헤더·값·중복 검증 → 행 목록 + 오류 목록(행 번호)
 *  - importStudents  : 트랜잭션. 없는 반 자동 생성, (반, 번호) 기준 upsert, display_name 반 단위 재계산
 *  - dryRun 은 같은 트랜잭션을 돌린 뒤 롤백해 결과만 돌려준다(검증 로직 이중화 방지)
 */
import type { PoolConnection } from 'mysql2/promise';
import { AppError } from '../lib/apiResponse.js';
import { parseCsv } from '../lib/csv.js';
import { generateInitialPassword, hashPassword, validatePasswordPolicy } from '../lib/password.js';
import { buildStudentLoginId } from '../lib/studentId.js';
import { tx } from '../db/query.js';
import { writeAudit } from '../repos/auditRepo.js';
import { findClassByGradeNo, insertClass } from '../repos/classRepo.js';
import { currentSchoolYear } from '../repos/schoolYearRepo.js';
import * as userRepo from '../repos/userRepo.js';
import type { ImportResult, ImportRowError, ImportRowResult } from '../types/api.js';
import type { YesNo } from '../types/db.js';

export const CSV_HEADER = [
  '학년',
  '반',
  '번호',
  '이름',
  '초기비밀번호',
  '학부모동의',
  '기자단',
] as const;

export interface ParsedStudentRow {
  line: number;
  grade: number;
  classNo: number;
  studentNo: number;
  name: string;
  initialPassword: string | null;
  parentConsent: YesNo;
  isReporter: boolean;
}

export interface ParseResult {
  rows: ParsedStudentRow[];
  errors: ImportRowError[];
}

function yesNo(v: string): YesNo | null {
  const s = v.trim().toUpperCase();
  if (s === 'Y' || s === '예' || s === 'O') return 'Y';
  if (s === 'N' || s === '' || s === '아니오' || s === 'X') return 'N';
  return null;
}

export function parseStudentCsv(text: string, allowedGrades: number[]): ParseResult {
  const errors: ImportRowError[] = [];
  const rows: ParsedStudentRow[] = [];
  const table = parseCsv(text);
  const header = table[0];
  if (!header) return { rows, errors: [{ line: 1, message: 'CSV가 비어 있어요.' }] };
  const normalizedHeader = header.map((h) => h.replace(/\s|\(.*\)/g, ''));
  const missing = CSV_HEADER.filter((h) => !normalizedHeader.includes(h));
  if (missing.length > 0) {
    return {
      rows,
      errors: [
        {
          line: 1,
          message: `첫 줄에 ${missing.join(', ')} 열이 없어요. 열 순서: ${CSV_HEADER.join(',')}`,
        },
      ],
    };
  }
  const idx = Object.fromEntries(CSV_HEADER.map((h) => [h, normalizedHeader.indexOf(h)])) as Record<
    (typeof CSV_HEADER)[number],
    number
  >;
  const seen = new Map<string, number>();

  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (h: (typeof CSV_HEADER)[number]) => (cells[idx[h]] ?? '').trim();
    const problems: string[] = [];
    const grade = Number(get('학년'));
    const classNo = Number(get('반'));
    const studentNo = Number(get('번호'));
    const name = get('이름');
    const pw = get('초기비밀번호');
    const consent = yesNo(get('학부모동의'));
    const reporter = yesNo(get('기자단'));

    if (!Number.isInteger(grade) || !allowedGrades.includes(grade))
      problems.push(`학년은 ${allowedGrades.join('·')}만 가능`);
    if (!Number.isInteger(classNo) || classNo < 1 || classNo > 30) problems.push('반은 1~30');
    if (!Number.isInteger(studentNo) || studentNo < 1 || studentNo > 60)
      problems.push('번호는 1~60');
    if (name.length < 2 || name.length > 30) problems.push('이름은 2~30자');
    if (pw && !validatePasswordPolicy('student', pw).ok)
      problems.push('초기비밀번호는 4자 이상(띄어쓰기 없이)');
    if (consent === null) problems.push('학부모동의는 Y 또는 N');
    if (reporter === null) problems.push('기자단은 Y 또는 N');

    const key = `${grade}-${classNo}-${studentNo}`;
    if (problems.length === 0) {
      const dup = seen.get(key);
      if (dup !== undefined) problems.push(`${dup}번째 줄과 같은 학년·반·번호`);
      else seen.set(key, line);
    }

    if (problems.length > 0) {
      errors.push({ line, message: problems.join(', ') });
      return;
    }
    rows.push({
      line,
      grade,
      classNo,
      studentNo,
      name,
      initialPassword: pw || null,
      parentConsent: consent as YesNo,
      isReporter: reporter === 'Y',
    });
  });

  return { rows, errors };
}

class DryRunRollback extends Error {}

export interface ImportOptions {
  dryRun: boolean;
  actorId: number;
  ip?: string;
}

export async function importStudents(
  rows: ParsedStudentRow[],
  opts: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = {
    dryRun: opts.dryRun,
    created: 0,
    updated: 0,
    createdClasses: [],
    rows: [],
    errors: [],
  };
  if (rows.length === 0) return result;

  const run = async (conn: PoolConnection) => {
    const year = await currentSchoolYear(conn);
    if (!year)
      throw AppError.conflict(
        '현재 학년도가 설정되어 있지 않아요. 학교 설정에서 학년도를 먼저 만들어 주세요.',
      );

    const classCache = new Map<string, number>();
    const touchedClasses = new Set<number>();

    for (const r of rows) {
      const ck = `${r.grade}-${r.classNo}`;
      let classId = classCache.get(ck);
      if (classId === undefined) {
        const found = await findClassByGradeNo(year.id, r.grade, r.classNo, conn);
        if (found) classId = found.id;
        else {
          classId = await insertClass(year.id, r.grade, r.classNo, conn);
          result.createdClasses.push(ck);
        }
        classCache.set(ck, classId);
      }
      touchedClasses.add(classId);

      const loginId = buildStudentLoginId(year.year, r.grade, r.classNo, r.studentNo);
      const existing = await userRepo.findStudentByClassNo(classId, r.studentNo, conn);
      const row: ImportRowResult = {
        line: r.line,
        loginId,
        className: ck,
        studentNo: r.studentNo,
        action: existing ? 'update' : 'create',
        initialPassword: null,
      };

      if (existing) {
        await userRepo.updateStudentFromImport(
          existing.id,
          { name: r.name, parentConsent: r.parentConsent, isReporter: r.isReporter },
          existing.parent_consent !== r.parentConsent,
          conn,
        );
        // 비밀번호는 학생이 아직 바꾸지 않은 경우에만 CSV 값으로 교체
        if (r.initialPassword && existing.must_change_pw === 1) {
          await userRepo.updatePassword(
            existing.id,
            await hashPassword(r.initialPassword),
            true,
            conn,
          );
          row.initialPassword = r.initialPassword;
        }
        result.updated += 1;
      } else {
        const pw = r.initialPassword ?? generateInitialPassword(r.name);
        await userRepo.insertStudent(
          {
            loginId,
            passwordHash: await hashPassword(pw),
            name: r.name,
            classId,
            studentNo: r.studentNo,
            parentConsent: r.parentConsent,
            isReporter: r.isReporter,
          },
          conn,
        );
        row.initialPassword = pw;
        result.created += 1;
      }
      result.rows.push(row);
    }

    for (const classId of touchedClasses) await userRepo.recomputeDisplayNames(classId, conn);

    await writeAudit(
      {
        actorId: opts.actorId,
        action: 'students.import',
        payload: {
          created: result.created,
          updated: result.updated,
          createdClasses: result.createdClasses,
          dryRun: opts.dryRun,
        },
        ip: opts.ip,
      },
      conn,
    );
    if (opts.dryRun) throw new DryRunRollback();
  };

  try {
    await tx(run);
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }
  return result;
}
