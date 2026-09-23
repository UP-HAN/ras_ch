import { describe, expect, it } from 'vitest';
import { validateArticle } from './articleRules.js';

const ok = {
  title: '토요 스포츠데이 배구 경기',
  tags: ['S'],
  articleType: 'review',
  body: '가'.repeat(200),
  oneLine: '재미있었다',
};

// ART-01
describe('validateArticle', () => {
  it('정상', () => {
    expect(validateArticle(ok)).toBeNull();
  });
  it('제목 2~40', () => {
    expect(validateArticle({ ...ok, title: '가' })).toContain('제목');
    expect(validateArticle({ ...ok, title: '가'.repeat(41) })).toContain('제목');
  });
  it('태그 1개 이상, 허용 값만', () => {
    expect(validateArticle({ ...ok, tags: [] })).toContain('영역');
    expect(validateArticle({ ...ok, tags: ['X'] })).toContain('영역');
    expect(validateArticle({ ...ok, tags: ['R', 'phonefree'] })).toBeNull();
  });
  it('본문 200~3000, 카드뉴스는 50~', () => {
    expect(validateArticle({ ...ok, body: '가'.repeat(199) })).toContain('200~3000');
    expect(validateArticle({ ...ok, articleType: 'cardnews', body: '가'.repeat(50) })).toBeNull();
    expect(validateArticle({ ...ok, articleType: 'cardnews', body: '가'.repeat(49) })).toContain(
      '50~3000',
    );
    expect(validateArticle({ ...ok, body: '가'.repeat(3001) })).toContain('본문');
  });
  it('유형·소감', () => {
    expect(validateArticle({ ...ok, articleType: 'poem' })).toContain('유형');
    expect(validateArticle({ ...ok, oneLine: '가'.repeat(101) })).toContain('소감');
  });
});
