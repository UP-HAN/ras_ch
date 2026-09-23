/**
 * 기사 규칙 (ART-01, ART-02) — 순수 상수·검증
 */
export const ARTICLE_TAGS = ['R', 'A', 'S', 'phonefree'] as const;
export type ArticleTag = (typeof ARTICLE_TAGS)[number];
export const ARTICLE_TAG_LABEL: Record<ArticleTag, string> = {
  R: '독서',
  A: '예술문화',
  S: '스포츠',
  phonefree: '폰프리',
};

export const ARTICLE_TYPES = ['coverage', 'interview', 'review', 'cardnews'] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];
export const ARTICLE_TYPE_LABEL: Record<ArticleType, string> = {
  coverage: '취재 기사',
  interview: '인터뷰',
  review: '체험 후기',
  cardnews: '카드뉴스',
};

export const ARTICLE_LIMITS = {
  titleMin: 2,
  titleMax: 40,
  bodyMin: 200,
  bodyMinCardnews: 50,
  bodyMax: 3000,
  oneLineMax: 100,
  photosMax: 3,
} as const;

export interface ArticleInput {
  title: string;
  tags: string[];
  articleType: string;
  body: string;
  oneLine: string | null;
}

const charLen = (s: string) => Array.from(s).length;

/** 첫 번째 문제만 한국어로 돌려준다. 없으면 null */
export function validateArticle(input: ArticleInput): string | null {
  const title = input.title.trim();
  if (charLen(title) < ARTICLE_LIMITS.titleMin || charLen(title) > ARTICLE_LIMITS.titleMax) {
    return `제목은 ${ARTICLE_LIMITS.titleMin}~${ARTICLE_LIMITS.titleMax}자로 써 주세요.`;
  }
  if (!(ARTICLE_TYPES as readonly string[]).includes(input.articleType))
    return '기사 유형을 골라 주세요.';
  const tags = [...new Set(input.tags)];
  if (tags.length === 0 || tags.some((t) => !(ARTICLE_TAGS as readonly string[]).includes(t))) {
    return '영역(독서·예술문화·스포츠·폰프리)을 하나 이상 골라 주세요.';
  }
  const min =
    input.articleType === 'cardnews' ? ARTICLE_LIMITS.bodyMinCardnews : ARTICLE_LIMITS.bodyMin;
  const bodyLen = charLen(input.body.trim());
  if (bodyLen < min || bodyLen > ARTICLE_LIMITS.bodyMax) {
    return `본문은 ${min}~${ARTICLE_LIMITS.bodyMax}자로 써 주세요. (지금 ${bodyLen}자)`;
  }
  if (input.oneLine && charLen(input.oneLine) > ARTICLE_LIMITS.oneLineMax)
    return '한 줄 소감은 100자까지만요.';
  return null;
}
