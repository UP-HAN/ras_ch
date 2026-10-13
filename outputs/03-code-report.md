# 03-code-report — 디자인 개편 (coder)

작성: coder · 2026-10-13 · 기준: outputs/01-spec.md + 00-decisions.md (맨 아래 사용자 결정 3줄 포함)

## 1. 결정 변경 반영 (01-spec 보다 우선)
- 사이트 전체(학생·교사·관리자·로그인) **초록·연두·민트 톤**. primary·accent 토큰 값을 바꿨다. 흰 글자·글자색 대비는 모두 4.5:1 이상으로 다시 계산했다.
- 제목 글꼴은 바꾸지 않는다 → `--font-display: var(--font-sans)` (클래스 `font-display` 는 남겨 두었고 본문 글꼴로 보인다). Jua 제안은 폐기.
- 노랑·하늘·분홍·보라(sun·sky·berry·grape)는 배지·색종이·도장·1위 줄 같은 작은 포인트에만 쓴다. 홈·글쓰기 큰 카드는 primary(연두)·mint·hero·accent(숲초록)·흰색만 쓴다.

### 토큰 이전 값 → 새 값
| 토큰 | 이전 | 새 값 | 대비 확인 |
|---|---|---|---|
| primary-50 | #fff7ed | #f0fae6 | primary-700 글자 6.32 |
| primary-100 | #ffedd5 | #dcf3c8 | primary-700 5.73 / primary-800 7.88 |
| primary-200 | #fed7aa | #bfe6a0 | primary-800 6.70 |
| primary-300 | #fdba74 | #9ad46f | 테두리용 |
| primary-400 | #f8a24a | #6cbf45 | 장식용(글자 금지) |
| primary-500 | #f28c28 | #4ea83a | 장식용(흰 글자 금지) |
| primary-600 | #c96a0f | #2e7d32 | 흰 글자 5.13 |
| primary-700 | #a3540b | #24682a | 흰 글자 6.80, 흰 바탕 글자 6.80 |
| primary-800 | #7c3f08 | #1b5121 | 흰 글자 9.35 |
| primary-900 | #5a2e06 | #123a17 | |
| accent-50 | #eef3f9 | #eaf6f1 | accent-600 글자 6.87 |
| accent-100 | #d8e3f0 | #cfeadf | accent-700 7.93 / accent-900 12.05 |
| accent-500 | #2f5486 | #2f7d66 | 흰 글자 4.95 |
| accent-600 | #1e3a5f | #1d5e4c | 흰 글자 7.62 (교사 메뉴 활성) |
| accent-700 | #162c48 | #164a3c | 흰 글자 10.10 |
| accent-900 | #0b1626 | #0b2a22 | |
| paper | #fff9f2 | #f6fbef | ink 13.95 / ink-muted 5.69 |
| line | #e7e0d6 | #dcebd0 | |
| line-strong | #cfc5b7 | #b9cfae | |
| shadow-card | 회색 그림자 | `0 2px 0 rgb(220 235 208 / 1), 0 6px 16px rgb(46 125 50 / 0.08)` | |
| shadow-pop (새) | — | `0 4px 0 #1b5121` | |
| shadow-pop-soft (새) | — | `0 3px 0 #bfe6a0` | |
| gradient-hero (새) | — | `linear-gradient(135deg, #f0fae6 0%, #d5f7ea 55%, #e3f6ff 100%)` | 글자 ink |
| gradient-rainbow (새) | — | `linear-gradient(90deg, #2e7d32, #6cbf45, #b5e550, #3ccf9a, #26b5a0)` | 장식 |
| radius sm/md/lg/xl | 8/12/16/20 | 10/14/20/28 | |
- 그대로: ink 계열, 상태색(success/warn/danger/info), sun·mint·sky·berry·grape 5계열(01-spec 3.2 값 그대로, 700 단계 글자 대비 4.64~7.27), text·spacing 토큰.
- 참고: 01-spec 8장 체크리스트의 "primary-600 #c96a0f, accent-600 #1e3a5f 유지", "--font-display 값" 항목은 사용자 결정으로 바뀐 것이라 대조 시 위 표를 기준으로 해 주세요.

## 2. 바꾼 파일
- 스타일: `client/src/styles/tokens.css`, `index.css`(motion.css 불러오기, 물방울 무늬, `.bg-hero`·`.bg-rainbow`), 새 `motion.css`
- 공통: `components/ui/Button.tsx`(젤리 그림자·누름), `Card.tsx`(rounded-xl·2px·tone 6개 추가·제목 점·pop-in), `Badge.tsx`(tone 5개 추가), `EmptyState.tsx`(illustration prop), `Input.tsx`(포커스 초록 테두리+빛), `Modal.tsx`(배경 50%, Card 로 pop-in). ConfirmDialog 는 Modal 을 거쳐 반영돼 파일 수정 없음
- 레이아웃: `StudentShell.tsx`(LanternLogo·무지개 띠·하단 탭 알약+통통), `TeacherShell.tsx`(LanternLogo·무지개 띠, `.motion-off` 로 움직임 없음, 메뉴·표 그대로), `PageHeader.tsx`(무지개 띠, illustration prop), `icons.tsx`(선 2.25)
- 공통 부품: `TierBadge.tsx`(등급별 색, star 반짝), `MissionGauge.tsx`(20px, 채움 움직임)
- 화면: `LoginPage`, `PlaceholderPage`, 학생 `HomePage`, `WritePage`, `MyPage`, `MyPointsPage`, `HallOfFamePage`, `DebatePage`, `DebateTopicPage`, `PostListPage`, `CouncilListPage`, `ReviewQueuePage`, `PostDetailPage`, `CouncilPostPage`, `ReviewPostPage`. `ChangePasswordPage` 는 토큰·Card 로 자동 반영되어 수정 없음
- `client/public/sw.js`: VERSION `ras-shell-v2`, `/illustrations/` 캐시 우선(404 는 캐시 안 함)
- 새 파일: `lib/illustrations.ts`, `lib/motion.ts`, `lib/celebrate.ts`, `lib/celebrate.test.ts`, `components/fun/{Mascot, Confetti, Celebration, TierUpModal, AttendanceStamp, PageLoading, LanternLogo}.tsx`(Mascot.tsx 안에 가로 그림용 `Illustration` 도 있음), `scripts/convert-illustrations.mjs`
- `server/` 변경 0건, 새 npm 패키지 0개, `data-testid` 삭제 0건(새로 `attendance-stamp`·`celebration`·`tier-up` 추가), "시연" 글자 추가 0건.

## 3. 모션 목록 (motion.css)
| # | 클래스/컴포넌트 | 길이·반복 |
|---|---|---|
| 1 | `.anim-pop-in` (+ `.anim-stagger` 로 40ms 씩, 최대 6장) | 280ms 1회 |
| 2 | `useCountUp` (홈 이번 주 포인트, 내 정보·내 포인트 3칸) | 800ms easeOutCubic 1회 |
| 3 | `Celebration` + `Confetti` (`.anim-hop`, `.anim-confetti` 16조각 6색) | 색종이 1200ms, 자동 닫힘 3000ms |
| 4 | `TierUpModal` (`.anim-tier-emoji` 600ms, `.anim-rays` 8s 회전) | 자동 닫힘 없음 |
| 5 | `AttendanceStamp` (`.anim-stamp`) | 450ms, 하루 1번 |
| 6 | `.anim-gauge-fill` / `.anim-gauge-shine` | 900ms / 1200ms 1회 |
| 7 | `.anim-flame` | 1600ms 반복 |
| 8 | `.anim-float` | 3000ms 반복 |
| 9 | `.anim-swing` | 1200ms 반복 |
| 10 | `.anim-tab-bounce` | 300ms 1회 |
| 11 | `.anim-sparkle` | 1000ms 1회 |
| 12 | `.anim-lantern` | 3000ms 반복 |
| 13 | `.anim-press` | 120ms transition |
| 14 | `.anim-medal` | 600ms 1회 |
- `prefers-reduced-motion: reduce` 에서 모든 `[class*='anim-']` 의 animation·transition 을 끄고, 색종이·게이지 빛·반짝 띠는 숨긴다. 숫자는 바로 최종값.
- 교사 화면은 `.motion-off` 로 같은 방식으로 끈다.

## 4. 축하 판단 (celebrate.ts)
- localStorage 키 `ras.v1.{userId}.lastWeekKey / lastWeekPoints / lastTier / stampDate`, 모든 읽기·쓰기 try/catch. 저장소가 막히면 축하·도장 움직임 없이 지나간다.
- 홈에서 등급 → 포인트 순서로 최대 2개. vitest 9개(처음 방문·같은 주 증가·주 바뀜·회수·등급 상승/하강·학생별 분리·저장소 막힘·도장 같은 날·서울 날짜).

## 5. 검사 결과 (2026-10-13)
- `npm run typecheck` 통과
- `npm test` 통과 — 36 파일, 298 테스트 (Button.test 3개 포함, celebrate.test 9개 새로 추가)
- `npm run lint` 통과 (오류 0). HomePage 의 축하 반영 effect 1곳에 `react-hooks/set-state-in-effect` 예외 주석(사유: localStorage 와 비교한 결과를 반영)
- `npm run build -w client` 통과 (500kB 넘는 덩어리 경고는 원래부터 있던 것)
- 화면 확인: 360px·1280px 가로 스크롤 없음, 콘솔 오류는 로그아웃 상태의 `/me` 401(정상)뿐

## 6. 스크린샷 (`outputs/code/screens/`)
- `360-login.png`, `1280-login.png`, `360-login-reduced-motion.png`
- 로그인이 필요한 화면은 지시대로 찍지 않았다.

### 로그인 화면 확인 필요 목록 (메인이 직접 확인)
1. 학생 홈(360px): 인사 카드(hero 그라데이션·초롱이 64px·포인트 숫자 올라감·출석 도장 "쾅"), 미션 카드(mint)·우리 반 미션(primary)·리포트 카드 초롱이(연필), 알림/최근 글 빈 화면
2. 학생 홈 축하 창: 같은 주에 포인트가 늘었을 때 `+nP 받았어요!`, 등급이 올랐을 때 등급 창 (처음 방문 기기는 저장만 하므로 두 번째 방문부터)
3. 글쓰기(360px): 09 그림 자리, 카드 3색
4. 명예의 전당(360px): 머리 초롱이, 탭, 교사 계정이면 1~3위 메달 흔들림·1위 노랑 줄
5. 토론방(360px): 머리 초롱이(생각), 빈 화면
6. 내 정보(360px): 등급 카드 초롱이(빛)·칭호 칸 색, 내 포인트(360px): hero 카드·+ 줄 민트 글자
7. 하단 탭 활성 알약·통통, 헤더 초롱 로고 흔들림·무지개 띠, 자치회 임원이면 "🔍 검토" 버튼 색
8. 교사 대시보드(1280px): 사이드바 무지개 띠·LanternLogo·숲초록 메뉴 활성색, 카드·버튼·배지 초록 톤, 움직임 없음
9. 관리자 메뉴 화면(1280px): 표·정보 밀도 그대로인지

## 7. 그림 변환 상태

> **갱신(메인, 2026-10-13 11:45):** 초록 톤으로 다시 그린 01~10 PNG 를 모두 webp 로 변환 완료(10장, 합계 약 335KB). 01 은 초록으로 다시 그림. 사이트 로고·favicon·홈 화면 아이콘도 초롱이로 교체(`scripts/gen-mascot-icons.mjs`), `sw.js` VERSION 은 `ras-shell-v3`. 아래 원래 기록은 작업 당시 상태.

- `node scripts/convert-illustrations.mjs` 로 다시 돌릴 수 있다(있는 것만 변환, 없는 것은 "변환 대기" 출력).
- 완료: `01-mascot-hello.webp` 512x512, q80, 13.8KB
- 변환 대기: 02-mascot-cheer, 03-mascot-sleep, 04-mascot-think, 05-mascot-write, 06-mascot-trophy, 07-mascot-oops, 08-login-hero, 09-activities, 10-mascot-shine (outputs/art 에 PNG 가 아직 없음)
- 그림이 없을 때: 마스코트는 숨기거나 원래 이모지를 대신 보여 주고, 08·09 큰 그림은 자리째 숨긴다(로그인 화면은 겹침 여백도 없앰). 위 360 스크린샷이 이 상태.
- 주의: 지금 있는 01 그림은 주황 몸통이라 새 결정(마스코트 몸통 초록 계열)과 다르다. 다시 그리면 스크립트만 다시 돌리면 되고, 서비스 워커 캐시 때문에 운영에서는 `sw.js` VERSION 을 한 번 올려야 새 그림이 바로 보인다.

## 8. 제안
- 제안: 01 마스코트를 초록 몸통으로 다시 그린 뒤 02~10 을 그리기(지금 01 은 주황).
- 제안: 그림 교체 배포 때 `sw.js` VERSION 을 `ras-shell-v3` 로 올리기.
- 제안: 글쓰기 폼(ReportFormPage·ArticleFormPage·CouncilFormPage)의 첫 로딩 Spinner 도 PageLoading 으로 맞추기(이번 명세 범위 밖이라 그대로 둠).
- 제안: Input 의 포커스 파란 외곽선은 원래 코드가 `focus:outline-none` 으로 숨기고 있어서 그대로 두었다. 키보드 사용자를 위해 보이게 할지 결정이 필요.
