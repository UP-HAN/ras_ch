/** 기사 상수 (ART-01, 02). 서버 lib/articleRules.ts 와 값이 같아야 한다 */
export const ARTICLE_TAGS = [
  { key: 'R', label: '독서', emoji: '📚' },
  { key: 'A', label: '예술문화', emoji: '🎨' },
  { key: 'S', label: '스포츠', emoji: '⚽' },
  { key: 'phonefree', label: '폰프리', emoji: '📵' },
] as const;

export const ARTICLE_TYPES = [
  {
    key: 'coverage',
    label: '취재 기사',
    minBody: 200,
    prompts: [
      '언제, 어디서, 누가 한 활동인가요?',
      '어떤 일이 있었나요? 순서대로 써 보세요.',
      '친구들 반응은 어땠나요?',
    ],
  },
  {
    key: 'interview',
    label: '인터뷰',
    minBody: 200,
    prompts: [
      '누구를 인터뷰했나요?',
      '어떤 질문을 했고 뭐라고 답했나요?',
      '가장 기억에 남는 말은?',
    ],
  },
  {
    key: 'review',
    label: '체험 후기',
    minBody: 200,
    prompts: [
      '무엇을 체험했나요?',
      '재미있었던 점, 어려웠던 점은?',
      '다른 친구에게 추천하고 싶은 이유는?',
    ],
  },
  {
    key: 'cardnews',
    label: '카드뉴스',
    minBody: 50,
    prompts: [
      '사진 1~3장을 고르고, 각 사진을 한두 문장으로 설명해요.',
      '가장 알리고 싶은 한 가지는?',
    ],
  },
] as const;

export function tagLabel(key: string): string {
  const t = ARTICLE_TAGS.find((x) => x.key === key);
  return t ? `${t.emoji} ${t.label}` : key;
}

export function typeLabel(key: string): string {
  return ARTICLE_TYPES.find((x) => x.key === key)?.label ?? key;
}
