import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

// PRD 10장: 버튼 44px 이상, 글자 16px 이상
describe('Button', () => {
  it('최소 높이 44px(min-h-tap)과 16px 글자(text-base) 클래스를 가진다', () => {
    render(<Button>리포트 올리기</Button>);
    const btn = screen.getByRole('button', { name: '리포트 올리기' });
    expect(btn.className).toContain('min-h-tap');
    expect(btn.className).toContain('text-base');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('loading 이면 비활성 + aria-busy + 스피너', () => {
    render(<Button loading>저장 중</Button>);
    const btn = screen.getByRole('button', { name: /저장 중/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('variant 별 배경 클래스', () => {
    render(<Button variant="secondary">취소</Button>);
    expect(screen.getByRole('button', { name: '취소' }).className).toContain('border-primary-300');
  });
});
