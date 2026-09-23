import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import './styles/index.css';

// CMN-02 PWA: 운영 빌드에서만 서비스 워커 등록 (dev 는 HMR 과 충돌)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('#root 요소가 없습니다');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
