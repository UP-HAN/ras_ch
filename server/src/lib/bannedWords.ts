/**
 * 금칙어 필터 (RCT-04, TCH-06 "금칙어 근접") — 순수 함수
 *  - 공백·기호·영문 대소문자를 정규화한 뒤 부분 일치로 찾는다 ("바 보", "바.보" 도 잡힘)
 */
export function normalizeForBanned(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

/** 본문에 들어 있는 금칙어 목록(중복 제거). 없으면 빈 배열 */
export function findBannedWords(text: string, words: readonly string[]): string[] {
  const hay = normalizeForBanned(text);
  if (!hay) return [];
  const hits: string[] = [];
  for (const w of words) {
    const needle = normalizeForBanned(w);
    if (needle && hay.includes(needle) && !hits.includes(w)) hits.push(w);
  }
  return hits;
}

export function bannedWordMessage(hits: string[]): string {
  return `쓸 수 없는 말이 들어 있어요(${hits.join(', ')}). 친구가 기분 좋을 말로 바꿔 주세요.`;
}
