import { useSearchParams } from 'react-router-dom';
import type { ClassView } from '@server-types/api';

/**
 * 교사 화면의 "반 선택"을 URL `?class=<id>` 와 동기화 (QA #22).
 * 새로고침·뒤로가기에도 선택한 반이 유지된다. 파라미터가 없거나 볼 수 없는 반이면 첫 반.
 */
export function useClassParam(classes: ClassView[] | undefined): {
  selected: number | null;
  select: (id: number) => void;
} {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('class'));
  const valid = classes?.some((c) => c.id === raw) ? raw : null;
  const selected = valid ?? classes?.[0]?.id ?? null;
  const select = (id: number) => {
    const next = new URLSearchParams(params);
    next.set('class', String(id));
    setParams(next, { replace: true });
  };
  return { selected, select };
}
