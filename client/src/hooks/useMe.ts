import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeView } from '@server-types/api';
import { ApiError } from '@/api/client';
import { meApi } from '@/api/me';

export const ME_KEY = ['me'] as const;

/** 로그인 사용자. 401 이면 null (로그인 화면으로 보내는 판단은 RequireAuth 가 한다) */
export function useMe() {
  const q = useQuery<MeView | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await meApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
  return { me: q.data ?? null, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

export function useMeCache() {
  const qc = useQueryClient();
  return {
    set: (me: MeView | null) => qc.setQueryData(ME_KEY, me),
    clear: () => qc.clear(),
  };
}

export function isTeacherRole(me: MeView | null): boolean {
  return !!me && (me.role === 'teacher' || me.role === 'admin');
}
