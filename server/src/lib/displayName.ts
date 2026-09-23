/**
 * 표시 이름 규칙 (PRD 3.1, 절대 규칙 4)
 *  - 성 1글자 그대로 + 이름 첫 글자 ○ + 마지막 글자 그대로
 *  - 2글자 이름("김하") → "김○", 3글자("김초롱") → "김○롱", 4글자 이상("남궁민수") → "남○○수"
 *  - 같은 반에 마스킹 결과가 같은 학생이 둘 이상이면 "(번호)" 병기
 * 서버가 만들고 학생은 바꿀 수 없다. 학생용 API는 실명(name)을 내려보내지 않는다.
 */
export const MASK = '○';

export function maskName(name: string): string {
  const chars = Array.from(name.trim());
  if (chars.length === 0) return '';
  if (chars.length === 1) return chars[0] as string;
  const family = chars[0] as string;
  const given = chars.slice(1);
  if (given.length === 1) return `${family}${MASK}`;
  const last = given[given.length - 1] as string;
  const middle = MASK.repeat(given.length - 1);
  return `${family}${middle}${last}`;
}

export interface DisplayNameInput {
  /** 같은 반을 묶는 키(class_id). 반이 없으면 null */
  classId: number | null;
  studentNo: number | null;
  name: string;
}

export interface DisplayNameOutput<T extends DisplayNameInput> {
  item: T;
  displayName: string;
}

/**
 * 반 단위로 중복 마스킹 이름을 찾아 "(번호)"를 붙인다.
 * 반이 바뀌거나 학생이 추가되면 그 반 전체를 다시 계산해야 한다(재계산 대상은 호출자가 넘김).
 */
export function assignDisplayNames<T extends DisplayNameInput>(
  students: readonly T[],
): DisplayNameOutput<T>[] {
  const counts = new Map<string, number>();
  for (const s of students) {
    const key = `${s.classId ?? 'none'}|${maskName(s.name)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return students.map((s) => {
    const masked = maskName(s.name);
    const key = `${s.classId ?? 'none'}|${masked}`;
    const dup = (counts.get(key) ?? 0) > 1;
    const displayName = dup && s.studentNo !== null ? `${masked}(${s.studentNo})` : masked;
    return { item: s, displayName };
  });
}
