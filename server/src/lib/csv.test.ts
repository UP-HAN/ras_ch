import { describe, expect, it } from 'vitest';
import { decodeCsvBuffer, parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('헤더·행을 나누고 셀을 trim 한다', () => {
    expect(parseCsv('학년,반,번호,이름\n3, 1 ,5,김초롱\r\n')).toEqual([
      ['학년', '반', '번호', '이름'],
      ['3', '1', '5', '김초롱'],
    ]);
  });

  it('따옴표 안의 쉼표·줄바꿈·이중 따옴표를 처리한다', () => {
    expect(parseCsv('a,"b,c","say ""hi""","x\ny"')).toEqual([['a', 'b,c', 'say "hi"', 'x\ny']]);
  });

  it('빈 줄은 건너뛴다', () => {
    expect(parseCsv('a,b\n\n,\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('decodeCsvBuffer', () => {
  it('UTF-8 BOM 을 제거한다', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('학년,반', 'utf8')]);
    expect(decodeCsvBuffer(bytes)).toBe('학년,반');
  });

  it('UTF-8 이 아니면 EUC-KR(엑셀 저장본)로 읽는다', () => {
    // "학년" 의 EUC-KR 바이트
    const eucKr = new Uint8Array([0xc7, 0xd0, 0xb3, 0xe2, 0x2c, 0xb9, 0xdd]);
    expect(decodeCsvBuffer(eucKr)).toBe('학년,반');
  });
});
