/**
 * 마이그레이션 러너의 순수 로직(파일 정렬·SQL 분할). DB 없이 테스트한다.
 */
const FILE_RE = /^(\d{3,})_[\w-]+\.sql$/;

export function isMigrationFile(name: string): boolean {
  return FILE_RE.test(name);
}

/** 번호 접두어 순으로 정렬. 중복 번호는 오류. */
export function sortMigrationFiles(names: string[]): string[] {
  const files = names.filter(isMigrationFile);
  const seen = new Map<string, string>();
  for (const f of files) {
    const num = f.slice(0, f.indexOf('_'));
    const prev = seen.get(num);
    if (prev) throw new Error(`마이그레이션 번호가 중복됩니다: ${prev}, ${f}`);
    seen.set(num, f);
  }
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * SQL 파일을 문장 단위로 나눈다. 주석(--, 블록 주석)을 제거한 뒤 문자열 밖의 ';'에서 분할.
 * 트리거·프로시저(DELIMITER)는 쓰지 않는다.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let quote: string | null = null;
  while (i < sql.length) {
    const ch = sql[i] as string;
    const next = sql[i + 1];
    if (quote) {
      cur += ch;
      if (ch === '\\' && next !== undefined) {
        cur += next;
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      cur += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === ';') {
      const stmt = cur.trim();
      if (stmt) out.push(stmt);
      cur = '';
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  const last = cur.trim();
  if (last) out.push(last);
  return out;
}
