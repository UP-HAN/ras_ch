process.env.SESSION_SECRET = 'test-secret-test-secret';
import { describe, expect, it } from 'vitest';
import { csvEscape, toCsv } from './csvWrite.js';

describe('csvWrite', () => {
  it('BOM + CRLF, 쉼표·따옴표·줄바꿈 이스케이프', () => {
    const out = toCsv([
      ['반', '이름', '메모'],
      ['4-1', '장예준', '잘했어요, "정말"'],
      ['4-1', null, '두\n줄'],
    ]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe(
      '반,이름,메모\r\n4-1,장예준,"잘했어요, ""정말"""\r\n4-1,,"두\n줄"\r\n',
    );
  });
  it('숫자·빈값', () => {
    expect(csvEscape(30)).toBe('30');
    expect(csvEscape(undefined)).toBe('');
  });
});
