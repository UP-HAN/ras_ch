/**
 * 존댓말 원칙 (사이트 전체 원칙, 2026-09-25 사용자 결정): 이 사이트의 모든 글·댓글·기사는 존댓말로 쓴다.
 *  - 강제 차단이 아니라 "부드러운 안내": 반말 어미로 끝나는 문장을 찾아 화면에서 고쳐 달라고 알려 준다
 *  - 교사·임원은 반려 사유 'not_polite' / 검토 체크리스트 'polite' 로 확인한다
 *  - 클라이언트(client/src/lib/politeness.ts)에 같은 규칙이 있다. 바꾸면 둘 다 바꾼다
 */
export const POLITE_RULE = '이 사이트의 모든 글·댓글·기사는 존댓말로 써요.';
export const POLITE_HINT = '존댓말로 써요. (예: ~했어요, ~입니다, ~해 주세요)';

/** 문장 끝 정리: 따옴표·괄호·이모지·문장부호·공백 제거 */
function tail(sentence: string): string {
  return sentence
    .replace(/[\s"'“”‘’)\]}.!?~…]+$/u, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u, '')
    .trim();
}

const POLITE_END = /(요|죠|까|오|니다|십시오|세용|욥)$/u;
const INFORMAL_END =
  /((?<![니습])다|(?<!이)야|자|(?<!요)어|(?<!요)아|(?<![아어요])지|냐|니|래|잖아|거든|을까|ㄹ까|는데|더라|구나|군|네|걸)$/u;

/** 반말로 보이는 문장 목록 (없으면 []) — 화면 안내용, 서버에서 차단하지 않는다 */
export function findInformalSentences(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/(?<=[.!?…])\s+|\n+/u)) {
    const s = raw.trim();
    if (!s) continue;
    const t = tail(s);
    if (t.length < 3 || !/[가-힣]$/u.test(t)) continue;
    if (POLITE_END.test(t)) continue;
    if (INFORMAL_END.test(t)) out.push(s);
  }
  return out;
}

export function politeWarning(text: string): string | null {
  const hits = findInformalSentences(text);
  if (hits.length === 0) return null;
  const sample = hits[0] as string;
  return `반말로 보이는 문장이 있어요: "${sample.length > 30 ? `${sample.slice(0, 30)}…` : sample}" → 존댓말(~했어요, ~입니다)로 고쳐 주세요.`;
}
