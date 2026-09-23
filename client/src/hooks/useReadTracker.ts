import { useEffect, useRef } from 'react';
import { reactionsApi } from '@/api/reactions';

const MIN_SECONDS = 10;

/**
 * 읽기 이벤트 (PT-10): 상세 진입 시 open, 끝까지 스크롤 + 10초 지난 뒤 complete 를 한 번만 보낸다.
 * 서버가 열람 시작 시각과 대조하므로 클라이언트 타이머는 "언제 보낼지"만 정한다.
 */
export function useReadTracker(postId: number | null, enabled: boolean) {
  const sentRef = useRef(false);
  const scrolledRef = useRef(false);
  const startedRef = useRef<number>(0);

  useEffect(() => {
    if (!postId || !enabled) return;
    sentRef.current = false;
    scrolledRef.current = false;
    startedRef.current = Date.now();
    void reactionsApi.readOpen(postId).catch(() => undefined);

    const tryComplete = () => {
      if (sentRef.current || !scrolledRef.current) return;
      if (Date.now() - startedRef.current < MIN_SECONDS * 1000) return;
      sentRef.current = true;
      void reactionsApi.readComplete(postId).catch(() => undefined);
    };
    const onScroll = () => {
      const el = document.documentElement;
      if (window.innerHeight + window.scrollY >= el.scrollHeight - 24) {
        scrolledRef.current = true;
        tryComplete();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const timer = window.setInterval(tryComplete, 1000);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearInterval(timer);
    };
  }, [postId, enabled]);
}
