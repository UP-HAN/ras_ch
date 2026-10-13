/**
 * 글 속 학생 표시 이름 찾기 (3.1 표시 이름 형식, 2026-10-13 "줄바꿈 원칙").
 * 성○이름 · 2글자(성○) · 4글자 이상(가운데 ○○) · 같은 반 중복 "(번호)" · 앞의 "6-1 " 반 이름까지 한 조각.
 */
const NAME = /(\d+-\d+\s)?[가-힣]{1,2}○[가-힣○]*(\(\d+\))?/g;

export function splitNames(text: string): Array<{ text: string; isName: boolean }> {
  const out: Array<{ text: string; isName: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(NAME)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), isName: false });
    out.push({ text: m[0], isName: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), isName: false });
  return out;
}
