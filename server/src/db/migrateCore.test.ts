import { describe, expect, it } from 'vitest';
import { isMigrationFile, sortMigrationFiles, splitSqlStatements } from './migrateCore.js';

describe('sortMigrationFiles', () => {
  it('번호 순 정렬, sql 이 아닌 파일은 제외', () => {
    expect(
      sortMigrationFiles(['010_b.sql', '002_sessions.sql', 'README.md', '001_init.sql']),
    ).toEqual(['001_init.sql', '002_sessions.sql', '010_b.sql']);
  });

  it('번호가 중복되면 예외', () => {
    expect(() => sortMigrationFiles(['003_a.sql', '003_b.sql'])).toThrow(/중복/);
  });

  it('파일명 규칙', () => {
    expect(isMigrationFile('001_init.sql')).toBe(true);
    expect(isMigrationFile('init.sql')).toBe(false);
    expect(isMigrationFile('001_init.sql.bak')).toBe(false);
  });
});

describe('splitSqlStatements', () => {
  it('주석을 제거하고 ; 로 나눈다', () => {
    const sql = `-- 헤더 주석
CREATE TABLE a (id INT); /* 블록 */
INSERT INTO a VALUES (1);
`;
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE TABLE a (id INT)',
      'INSERT INTO a VALUES (1)',
    ]);
  });

  it('문자열 안의 ; 와 -- 는 분할·주석으로 보지 않는다', () => {
    const sql = `INSERT INTO t (v) VALUES ('a;b'), ("x -- y"), ('it''s');`;
    expect(splitSqlStatements(sql)).toEqual([
      `INSERT INTO t (v) VALUES ('a;b'), ("x -- y"), ('it''s')`,
    ]);
  });

  it('백틱 식별자와 마지막 ; 없는 문장', () => {
    expect(splitSqlStatements('SELECT `key` FROM settings')).toEqual([
      'SELECT `key` FROM settings',
    ]);
  });
});
