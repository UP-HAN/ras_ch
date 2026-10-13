/*
 * 최소 서비스 워커 (CMN-02, PRD 11장): 앱 셸만 캐시, 네트워크 우선.
 *  - /api, /uploads, /healthz 는 캐시하지 않는다(개인정보·최신성)
 *  - 페이지 이동이 실패하면 offline.html 을 보여 준다
 *  - 정적 자산(/assets/*)은 캐시 우선(파일명에 해시가 있어 안전)
 *  - 일러스트(/illustrations/*)도 캐시 우선(학교 망 절약). 그림을 바꾸면 VERSION 을 올린다
 */
const VERSION = 'ras-shell-v3';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname === '/healthz'
  )
    return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(VERSION)
            .then((c) => c.put('/', copy))
            .catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match('/offline.html'))),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/illustrations/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // 아직 없는 그림(404)은 캐시하지 않는다: 나중에 그림이 올라오면 바로 보이게
            if (!res.ok) return res;
            const copy = res.clone();
            caches
              .open(VERSION)
              .then((c) => c.put(req, copy))
              .catch(() => undefined);
            return res;
          }),
      ),
    );
  }
});
