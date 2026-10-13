# 01-spec — 학생 화면 디자인 개편 (밝고 화려하게 + 일러스트 + 움직임)

작성: planner · 2026-10-13 · 이 문서가 이후 모든 담당의 유일한 기준(단일 원천)이다.

## 0. 한 문장 요약
초롱 RAS 포인트 학생 화면(모바일 360px 우선)을 마스코트 "초롱이" 일러스트 10장, 밝은 6색 팔레트, 가벼운 CSS/SVG 움직임으로 아이들이 좋아하는 모습으로 바꾼다. 기능·API·권한·데이터·문구 뜻은 그대로 둔다.

## 1. 지금 디자인 진단 (코드 확인 결과)
- 토큰: `client/src/styles/tokens.css` (Tailwind v4 `@theme`, tailwind.config 파일 없음). 주황(primary) + 남색(accent) 2색에 베이지 바탕 `#fff9f2`. 색이 적고 채도가 낮다.
- 글꼴: `Pretendard Variable`이 글꼴 목록 맨 앞에 있지만 실제로 불러오는 코드가 없다. 그래서 기기 기본 글꼴(맑은 고딕 등)로 보인다.
- 카드·버튼: 1px 테두리 + 아주 옅은 그림자, 버튼은 평평한 주황 사각형. 장식은 이모지뿐이고, 일러스트·움직임은 0개(움직이는 것은 `Spinner`의 `animate-spin` 1개뿐).
- 헤더는 이모지 🏮 + 글자, 하단 탭은 회색 선 아이콘. 빈 화면(`EmptyState`)은 점선 상자 + 이모지.
- 깨지면 안 되는 것: `Button.test.tsx`가 `min-h-tap`, `text-base`, `border-primary-300` 클래스를 검사한다. 모든 `data-testid`와 기존 화면 문구는 그대로 둔다.

## 2. 필요한 담당
| 담당 | 필요 여부 | 이유 |
|---|---|---|
| codex-illustrator | 필요 | 마스코트·장면 일러스트 10장 (PNG) |
| coder | 필요 | 토큰·컴포넌트·모션 CSS·이미지 webp 변환·화면 배치 |
| blender-3d | 필요 없음 | 3D 쓸 곳 없음 |
| motion-director | 필요 없음 | 웹앱 안 움직임은 CSS/SVG (00-decisions). 아래 "제안"만 있음 |

실행 순서: [Batch 2] codex-illustrator 와 coder 를 동시에 시작 → coder 는 마지막 단계에서 PNG 를 webp 로 바꾼다(7.6절) → [Batch 4] consistency-checker.

---

## 3. 공통 원천 (모든 담당이 이 값만 쓴다)

### 3.1 이름·문구
- 사이트 이름: `초롱 RAS 포인트` (그대로)
- 로그인 구호: `폰은 쉬go, 포인트는 쌓이go` (그대로)
- 마스코트 이름: **초롱이** (화면에 이름을 따로 쓰지는 않는다. 그림 alt 는 빈 값)
- 새로 생기는 문구 (모두 존댓말. 이 문구 그대로 쓴다):
  | 위치 | 문구 |
  |---|---|
  | 포인트 축하 큰 글자 | `+{n}P 받았어요!` |
  | 포인트 축하 작은 글자 | `정말 잘했어요. 계속 해 봐요!` |
  | 등급 올라감 큰 글자 | `{emoji} {label} 등급이 되었어요!` |
  | 등급 올라감 작은 글자 | `앞으로도 함께 해 봐요.` |
  | 축하 창 닫기 버튼 | `좋아요` |
  | 출석 도장 안의 글자(SVG) | `출석` |
  | 출석 도장 화면 읽기용(aria-label) | `오늘 출석 도장을 찍었어요` |
  | 페이지 불러오는 중 | `불러오고 있어요…` |

### 3.2 색 팔레트 (HEX, `tokens.css` 에 이 값 그대로)
기존 primary-600~900, accent 전부, 상태색(success/warn/danger/info), ink 계열은 **값을 바꾸지 않는다**(대비 4.5:1 검증된 값).

| 토큰 | 값 | 용도 / 규칙 |
|---|---|---|
| `--color-primary-50` | `#fff4e0` | (변경) 따뜻한 연주황 바탕 |
| `--color-primary-100` | `#ffe6c2` | (변경) |
| `--color-primary-200` | `#ffcf8f` | (변경) |
| `--color-primary-300` | `#ffb35c` | (변경) |
| `--color-primary-400` | `#ff9a33` | (변경) 장식용 |
| `--color-primary-500` | `#f28c28` | (유지) 장식용, 흰 글자 금지 |
| `--color-sun-100` | `#fff3c4` | 새로 추가 · 노랑 바탕 |
| `--color-sun-400` | `#ffd84d` | 장식용(글자색 금지) |
| `--color-sun-700` | `#8a5a00` | 노랑 바탕 위 글자 |
| `--color-mint-100` | `#d5f7ea` | 새로 추가 |
| `--color-mint-400` | `#3ccf9a` | 장식용 |
| `--color-mint-700` | `#0f7a58` | 글자 가능 |
| `--color-sky-100` | `#dcf0ff` | 새로 추가 |
| `--color-sky-400` | `#4fb3ff` | 장식용 |
| `--color-sky-700` | `#1764b0` | 글자 가능 |
| `--color-berry-100` | `#ffe0ec` | 새로 추가 |
| `--color-berry-400` | `#ff6fa3` | 장식용 |
| `--color-berry-700` | `#b8205e` | 글자 가능 |
| `--color-grape-100` | `#ece4ff` | 새로 추가 |
| `--color-grape-400` | `#9a7bff` | 장식용 |
| `--color-grape-700` | `#5b3cc4` | 글자 가능 |
| `--color-paper` | `#fff8ec` | (변경) 학생·교사 공통 바탕 |
| `--color-line` | `#f1e4d3` | (변경) |

규칙: `*-400`, `primary-500` 은 배경·테두리·장식에만 쓴다. 글자는 `*-700` 또는 `ink`. 흰 글자는 `primary-600` 이상, `accent-600` 이상, `*-700` 위에서만.

그라데이션 (CSS 변수, `tokens.css` 의 `:root` 에 둔다. `@theme` 밖):
- `--gradient-hero: linear-gradient(135deg, #fff3c4 0%, #ffe0ec 55%, #dcf0ff 100%)` — 홈 맨 위 카드. 글자는 ink.
- `--gradient-rainbow: linear-gradient(90deg, #f28c28, #ffd84d, #3ccf9a, #4fb3ff, #9a7bff)` — 헤더 아래 4px 띠, 게이지.

### 3.3 모서리·그림자 (`tokens.css`)
| 토큰 | 값 |
|---|---|
| `--radius-sm` | `10px` |
| `--radius-md` | `14px` |
| `--radius-lg` | `20px` |
| `--radius-xl` | `28px` |
| `--shadow-card` | `0 2px 0 rgb(241 228 211 / 1), 0 6px 16px rgb(201 106 15 / 0.08)` |
| `--shadow-pop` (새로) | `0 4px 0 #7c3f08` (주 버튼 아래 "젤리" 그림자) |
| `--shadow-pop-soft` (새로) | `0 3px 0 #ffcf8f` (보조 버튼) |

### 3.4 글꼴
- 본문: 지금 목록 그대로 (`--font-sans`).
- 제목용 새 토큰: `--font-display: 'Jua', 'Pretendard Variable', Pretendard, -apple-system, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif;` → Tailwind 클래스 `font-display`. 사이트 이름, PageHeader 제목, 포인트 큰 숫자, 축하 문구에만 쓴다.
- 글꼴 파일은 이번에 내려받지 않는다(외부 파일 다운로드는 사용자 확인 필요). 파일이 없으면 자동으로 본문 글꼴로 보인다.
- 제안: Jua(무료 OFL 글꼴)와 Pretendard woff2 를 `client/public/fonts/` 에 직접 넣으면 훨씬 귀여워집니다 — 사용자 승인 후 진행.

### 3.5 마스코트 "초롱이" 설정
- 생김새: 동그란 한국 청사초롱 모양 등불 캐릭터. 몸은 따뜻한 주황(#F28C28), 안쪽에서 노란 빛(#FFD84D)이 은은하게 비친다. 위·아래에 짧은 진한 빨강 뚜껑, 아래에 작은 금색 술. 크고 동그란 검은 눈에 흰 반짝임, 분홍 볼, 작은 웃는 입, 짧은 팔과 작은 발. 2등신.
- 성격: 밝고 다정하며, 폰을 잠깐 내려놓고 책·그림·운동을 하는 친구.
- 영어 캐릭터 문장 (마스코트 그림마다 그대로 붙인다):
  `the mascot "Chorong-i": a small cute round Korean paper lantern character (cheongsachorong-inspired), warm orange body (#F28C28) glowing softly with yellow light (#FFD84D) from inside, short dark red caps on top and bottom, a tiny golden tassel hanging below, big round black eyes with white highlights, rosy pink cheeks, a small happy smile, short stubby arms and tiny feet, chibi proportions about two heads tall`

### 3.6 일러스트 파일 목록 (단일 표, 두 담당 공통)
원본 PNG: `outputs/art/` · 웹용 webp: `client/public/illustrations/` (같은 이름, 확장자만 .webp)

| 번호·파일명 | 원본 크기 | webp 크기 | 용도 |
|---|---|---|---|
| `01-mascot-hello` | 1024x1024 | 512x512 | 인사: 로그인, 홈 인사 카드 |
| `02-mascot-cheer` | 1024x1024 | 512x512 | 축하: 포인트 축하 창, 미션 완료, 검토 다 함 |
| `03-mascot-sleep` | 1024x1024 | 512x512 | 빈 목록: 알림·글·포인트·자치회 글 없음 |
| `04-mascot-think` | 1024x1024 | 512x512 | 토론방 머리, 토론 빈 화면 |
| `05-mascot-write` | 1024x1024 | 512x512 | 홈 "이번 주 리포트" 카드(올릴 차례일 때) |
| `06-mascot-trophy` | 1024x1024 | 512x512 | 명예의 전당 머리, 명단 빈 화면 |
| `07-mascot-oops` | 1024x1024 | 512x512 | "불러오지 못했어요" 오류, 없는 페이지 |
| `08-login-hero` | 1536x1024 | 960x640 | 로그인 맨 위 큰 그림 |
| `09-activities` | 1536x1024 | 960x640 | 글쓰기 화면 맨 위 그림 |
| `10-mascot-shine` | 1024x1024 | 512x512 | 등급 올라감 창, 내 정보 "내 등급" 카드 |

용량 상한: 마스코트 webp 1장 60KB 이하, 큰 그림(08·09) 1장 120KB 이하, 10장 합계 700KB 이하.

---

## 4. 디자인 방향
- 분위기 한 줄: **"밤하늘에 초롱불이 반짝이는 놀이터"** — 따뜻한 주황을 중심으로 노랑·민트·하늘·분홍·보라가 카드마다 번갈아 나오고, 버튼은 눌리는 젤리처럼 통통하다.
- 원칙: 화려함은 색·모서리·그림·움직임으로 내고, 글자 크기(16px 이상)·버튼 높이(44px 이상)·대비(4.5:1)는 절대 낮추지 않는다.
- 카드 색 배정(홈): 인사 카드 = `--gradient-hero`, 공지 = sky, 자치회 = grape, 이번 주 미션 = grape, 우리 반 미션 = mint, 리포트 검토 = sky, 이번 주 리포트 = primary, 알림 = sun, 우리 반 최근 글 = 흰색.

---

## 5. codex-illustrator 할 일

### 5.1 산출물
- 경로: `outputs/art/01-mascot-hello.png` ~ `outputs/art/10-mascot-shine.png` (3.6절 표의 파일명 그대로)
- 규격: PNG 10장 · 마스코트 8장(01~07, 10) 1024x1024 · 장면 2장(08, 09) 1536x1024 · 그림 안에 글자·숫자·로고 0개
- 보고서: `outputs/02-art-report.md` (장마다 저장 경로, 실제 크기, 다시 그린 횟수)
- 호출 방법: 전역 CLAUDE.md 7장의 `codex exec ... -C "C:\Users\HAN\Desktop\Workspace\ras_ch\outputs\art"` 형식. 한 장씩 따로 호출(10번).
- 02~10 을 그릴 때는 프롬프트 앞에 `First look at 01-mascot-hello.png in the current folder and keep exactly the same character design.` 를 붙인다(01 이 먼저 완성되어야 함).

### 5.2 공통 스타일 문장 (모든 프롬프트 끝에 그대로 붙인다)
```
Style: cute flat vector-style children's picture-book illustration, soft rounded shapes, clean thick dark brown outlines (#5A2E06), gentle soft shading, bright cheerful palette of lantern orange #F28C28, sunshine yellow #FFD84D, mint #3CCF9A, sky blue #4FB3FF, berry pink #FF6FA3 and soft purple #9A7BFF, friendly happy mood for Korean elementary school kids aged 9 to 12. Absolutely no text, no letters, no Korean or English characters, no numbers, no logos, no watermark, no signature.
```
마스코트 단독 그림(01~07, 10)에는 아래 배경 문장도 붙인다:
```
Background: plain pure white background (#FFFFFF), the character centered, full body visible, at least 12 percent empty margin on every side, only a small soft oval shadow under the feet.
```

### 5.3 그림별 프롬프트 (영어, 앞뒤에 3.5 캐릭터 문장 + 5.2 문장을 붙인다)
| 파일 | 크기 | 프롬프트 본문 |
|---|---|---|
| 01-mascot-hello | 1024x1024 | `Chorong-i waving one hand hello with a big warm smile, facing the viewer, a few tiny yellow sparkles around it.` |
| 02-mascot-cheer | 1024x1024 | `Chorong-i jumping joyfully with both arms raised, eyes closed in happy arcs, colorful round confetti and small stars bursting around it.` |
| 03-mascot-sleep | 1024x1024 | `Chorong-i sitting calmly and smiling next to a tiny cartoon smartphone that is sleeping under a small blanket, a little "zzz"-like curl shape drawn only as wavy lines (no letters), cozy and peaceful.` |
| 04-mascot-think | 1024x1024 | `Chorong-i tilting its head and thinking with one hand on its chin, an empty round speech bubble and a small glowing light bulb floating above, curious expression.` |
| 05-mascot-write | 1024x1024 | `Chorong-i hugging a giant yellow pencil and standing next to an open notebook with only wavy blank lines, eager and proud expression.` |
| 06-mascot-trophy | 1024x1024 | `Chorong-i proudly holding up a shiny golden trophy cup above its head, small stars and a ribbon around, very happy.` |
| 07-mascot-oops | 1024x1024 | `Chorong-i looking a little puzzled, scratching its head with one hand, a small blue sweat drop near its cap, still cute and gentle, not sad.` |
| 08-login-hero | 1536x1024 | `Wide scene at early evening: a deep blue to purple night sky full of many floating glowing paper lanterns and small stars above a friendly small elementary school building with a green field. On the field, diverse Korean children aged 9 to 12 read books on a bench, draw pictures, and kick a soccer ball. A few smartphones rest happily asleep in a little basket on the grass. Chorong-i floats in the center of the sky glowing brightly. Keep all important elements inside the central horizontal band, leave calm sky at the top.` |
| 09-activities | 1536x1024 | `Bright daytime scene in a sunny classroom and playground split softly in one picture: children reading books together, painting on an easel, playing badminton and jumping rope, a basket of smartphones put aside with sleepy faces, Chorong-i cheering in the middle. Warm light, lots of color, keep the main subjects inside the central 70 percent of the image.` |
| 10-mascot-shine | 1024x1024 | `Chorong-i glowing extra brightly with golden light rays behind it, floating slightly upward with arms open, small stars and a seed, a sprout, a flower, an apple and a star icon circling around it like a growth path, triumphant and happy.` |

### 5.4 다시 그리는 기준 (이것 중 하나면 그 장만 다시, 최대 2번)
글자·숫자가 보인다 / 크기가 표와 다르다 / 마스코트가 01 과 눈에 띄게 다르다(색·모양·뚜껑·술) / 마스코트 그림에 흰 바탕이 아니다.

---

## 6. coder 할 일

### 6.1 산출 파일 (바꿀 것 · 새로 만들 것)
바꿀 파일:
- `client/src/styles/tokens.css` — 3.2~3.4 값 반영
- `client/src/styles/index.css` — `@import './motion.css';` 추가, body 바탕에 물방울 무늬(아래 6.3)
- `client/src/components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx`, `EmptyState.tsx`, `Modal.tsx`, `ConfirmDialog.tsx`, `Input.tsx`
- `client/src/components/layout/StudentShell.tsx`, `TeacherShell.tsx`, `PageHeader.tsx`, `icons.tsx`
- `client/src/components/common/TierBadge.tsx`, `MissionGauge.tsx`
- `client/src/pages/LoginPage.tsx`, `ChangePasswordPage.tsx`, `PlaceholderPage.tsx`
- `client/src/pages/student/HomePage.tsx`, `WritePage.tsx`, `MyPage.tsx`, `MyPointsPage.tsx`, `HallOfFamePage.tsx`, `DebatePage.tsx`, `DebateTopicPage.tsx`, `PostListPage.tsx`, `ReviewQueuePage.tsx`, `CouncilListPage.tsx`, `PostDetailPage.tsx`, `CouncilPostPage.tsx`, `ReviewPostPage.tsx` (빈 화면·오류·로딩 부분만)
- `client/public/sw.js` — `/illustrations/` 캐시 우선 추가, `VERSION` 을 `ras-shell-v2` 로
새 파일:
- `client/src/styles/motion.css` — 모든 keyframes 와 `.anim-*` 클래스
- `client/src/lib/illustrations.ts` — 그림 키 → 경로 표 (`ILLUSTRATIONS.hello = '/illustrations/01-mascot-hello.webp'` … 10개)
- `client/src/lib/motion.ts` — `usePrefersReducedMotion()`, `useCountUp(target, 800)`
- `client/src/lib/celebrate.ts` — 축하 판단(6.5 참조) + vitest 테스트 `celebrate.test.ts`
- `client/src/components/fun/Mascot.tsx` — `<Mascot name="hello" size={96} />` (img, `alt=""`, `aria-hidden`, `loading="lazy"`, `decoding="async"`, width/height 지정)
- `client/src/components/fun/Confetti.tsx`, `Celebration.tsx`, `TierUpModal.tsx`, `AttendanceStamp.tsx`, `PageLoading.tsx`, `LanternLogo.tsx`(SVG)
- `scripts/convert-illustrations.mjs` — sharp 로 PNG → webp 변환
- 보고서: `outputs/03-code-report.md` (바꾼 파일, 스크린샷 경로, 테스트 결과)
- 스크린샷: `outputs/code/screens/` 에 360px 7장(로그인·홈·글쓰기·명예의 전당·토론방·내 정보·내 포인트) + 1280px 2장(교사 대시보드·로그인)

### 6.2 지켜야 할 것
- 기능·API·라우트·권한·`data-testid`·기존 문구 그대로. 새 문구는 3.1 표만.
- 글자 16px 이상(`text-base` 미만 금지), 누르는 것 44px 이상(`min-h-tap`), 흰 글자 규칙(3.2).
- 새 npm 라이브러리 추가 금지(confetti·animation 라이브러리 포함). 필요하면 "제안:" 으로만.
- 마스코트 그림은 흰 바탕 그림이므로 **흰색(`bg-surface`) 위나 흰 원형 스티커 안에만** 놓는다. 색 카드 위에 둘 때는 `rounded-full bg-surface p-1` 원 안에 넣는다.
- 교사 화면은 색·헤더만: TeacherShell 로고를 `LanternLogo` + 사이트 이름으로, 사이드바 맨 위에 무지개 띠 4px. 메뉴·표·교사 페이지 내용은 건드리지 않는다. 교사 화면엔 움직임 없음.
- "시연" 표시를 새로 넣지 않는다(기존 관리자 메뉴의 시연 사이트 링크는 그대로).

### 6.3 공통 컴포넌트 변경
| 대상 | 변경 |
|---|---|
| body (index.css) | 배경 `var(--color-paper)` 위에 `radial-gradient(rgb(255 179 92 / 0.12) 1.5px, transparent 1.5px)` 22px 간격 물방울 무늬 |
| Button | 모서리 `rounded-lg`(20px). primary: `bg-primary-600 text-white` + `shadow-[var(--shadow-pop)]`, 누르면 `translate-y-[2px]` 그림자 2px 로(120ms). secondary: 흰 바탕 `border-2 border-primary-300 text-primary-700` + `--shadow-pop-soft`. danger 도 같은 젤리 방식(그림자 `#7f1d1d`). `min-h-tap`, `text-base`(md), `border-primary-300`(secondary) 클래스는 테스트 때문에 반드시 남긴다. lg 는 `min-h-14`(56px) 유지. 글자 `font-bold` |
| Card | `rounded-xl`(28px), 테두리 2px. tone 추가: `sun`, `mint`, `sky`, `berry`, `grape`, `hero`. 각 tone = `bg-{색}-100 border-{색}-400/40`, hero = `background: var(--gradient-hero)` + 테두리 `primary-200`. 제목 h2 왼쪽에 tone 색 동그라미 점 10px(장식). 등장 시 `.anim-pop-in` |
| Badge | `rounded-full`, 테두리 2px, `font-bold`. tone 은 그대로 + `sun`/`mint`/`sky`/`berry`/`grape` 추가(바탕 100, 글자 700) |
| TierBadge | 등급별 색: seed `bg-[#f3e6d8] text-[#6b4423]`, sprout `bg-mint-100 text-mint-700`, flower `bg-berry-100 text-berry-700`, fruit `bg-[#ffe1d6] text-[#b4361a]`, star `bg-sun-100 text-sun-700` + 테두리 `sun-400` 2px + 반짝 1회(6.4 #11). `data-testid="tier-badge"` 유지 |
| MissionGauge | 높이 16px→20px, 바탕 흰색 + 테두리 2px `line`, 채움 `--gradient-rainbow`(tone primary) / `mint-400`(success) / `sky-400`(accent), 채움 움직임 6.4 #6. `role="progressbar"`·aria 값 유지 |
| EmptyState | 점선 상자 대신 흰 바탕 `rounded-xl`. 새 prop `illustration?: IllustrationKey` → 있으면 이모지 대신 `<Mascot size={120} />` + 둥실 움직임(6.4 #8). 기존 `icon` prop 은 남긴다 |
| Modal·ConfirmDialog | `rounded-xl`, 등장 `.anim-pop-in`, 뒤 배경 `accent-900/50` |
| Input | `rounded-lg`, 테두리 2px, 포커스 시 테두리 `primary-400` + 바깥 빛 3px `primary-100` (기존 `:focus-visible` 파란 외곽선은 유지) |
| PageHeader | 제목 `font-display`, 제목 아래 무지개 띠 높이 4px·너비 48px·`rounded-full`. 새 prop `illustration?: IllustrationKey` → 오른쪽에 `<Mascot size={80} />` |
| StudentShell 헤더 | 높이 56px(h-14) 유지, 흰 바탕 95% + 아래 4px `--gradient-rainbow` 띠. 이모지 🏮 대신 `LanternLogo`(SVG 28x28, 6.4 #12 흔들림) + 사이트 이름 `font-display text-xl text-accent-600`. "🔍 검토" 버튼은 `rounded-full bg-sky-100 text-sky-700`(활성: `bg-sky-700 text-white`) |
| StudentShell 하단 탭 | 높이 64px 유지, 흰 바탕, 위쪽 모서리 20px, 위로 그림자 `0 -4px 16px rgb(201 106 15 / 0.10)`. 활성 탭: 아이콘 뒤에 56x32 `rounded-full bg-primary-100` 알약 + 글자 `text-primary-700 font-bold` + 통통 1회(6.4 #10). 비활성: `text-ink-muted` |
| icons.tsx | 선 굵기 2 → 2.25, 끝 둥글게(`stroke-linecap/linejoin="round"`) — 이미 둥글면 그대로 |
| PageLoading (새) | 페이지 전체 로딩(`q.isLoading` 자리)에 `Spinner size="lg"` 대신 사용: `<Mascot name="hello" size={96} />` 좌우 흔들림(6.4 #9) + `불러오고 있어요…`. 안에 `role="status"` 유지. 버튼 안 작은 `Spinner` 는 그대로 |

### 6.4 모션 목록 (전부 `motion.css` 에 정의, 숫자 그대로)
`@media (prefers-reduced-motion: reduce)` 에서는 **모든 `.anim-*` 를 `animation: none !important; transition: none !important;`** 로 끄고, 숫자는 바로 최종값, 축하 창은 그림·글자만 정지 상태로 보인다.

| # | 이름(클래스) | 어디에 | 움직임 | 길이·반복 |
|---|---|---|---|---|
| 1 | `anim-pop-in` | 학생 화면 카드·모달 등장 | 아래 8px → 제자리, 투명 0 → 1, 크기 0.98 → 1 | 280ms ease-out, 1회. 카드 순서대로 40ms씩 늦게(최대 6장, `--i` 변수) |
| 2 | count-up (`useCountUp`) | 홈 "이번 주 포인트", 내 포인트 3칸 숫자 | 0 → 실제 값 숫자 올라감 | 800ms, easeOutCubic, 1회 |
| 3 | `Celebration` + `Confetti` | 홈: 포인트가 지난번보다 늘었을 때(6.5) | 화면 가운데 흰 카드 pop-in + `02-mascot-cheer` 160px 통통(위로 12px 2번) + 색종이 16조각(6색, 위에서 퍼지며 떨어짐, 회전 360deg) + 3.1 문구 | 색종이 1200ms 1회, 카드 자동 닫힘 3000ms, 화면 누르거나 `좋아요`(44px 이상) 누르면 바로 닫힘 |
| 4 | `TierUpModal` | 홈: 등급이 지난번보다 올라갔을 때(6.5). 포인트 축하보다 먼저 1번만 | `10-mascot-shine` 160px + 등급 이모지 크기 0.4 → 1.2 → 1 + 뒤 빛줄기 SVG 천천히 회전 + 3.1 문구 | 이모지 600ms 1회, 빛줄기 8s 회전(창이 열려 있는 동안만), 자동 닫힘 없음, `좋아요` 로 닫힘 |
| 5 | `AttendanceStamp` | 홈 인사 카드의 "✅ 오늘 출석"/"🔥 n일 연속 출석" 옆 | 빨강(#b8205e) 원형 도장 SVG 48x48(안에 `출석`)이 크기 2 → 1, 회전 -12deg 로 "쾅" 찍힘 + 살짝 흔들림 | 450ms, 하루 1번(6.5), 그 뒤엔 정지 도장 |
| 6 | `anim-gauge-fill` | MissionGauge | 너비 0 → 값, 다 차면(100%) 하얀 빛이 왼→오 1번 지나감 | 채움 900ms ease-out 1회, 빛 1200ms 1회 |
| 7 | `anim-flame` | 🔥 연속 출석 이모지 | 크기 1 → 1.08 → 1, 살짝 기울기 ±4deg | 1600ms 반복 |
| 8 | `anim-float` | EmptyState 마스코트, PageHeader 마스코트 | 위아래 0 → -6px → 0 | 3000ms ease-in-out 반복 |
| 9 | `anim-swing` | PageLoading 마스코트 | 위쪽 중심으로 -6deg ↔ 6deg 흔들림 | 1200ms ease-in-out 반복 |
| 10 | `anim-tab-bounce` | 하단 탭이 활성으로 바뀔 때 아이콘 | 크기 1 → 1.18 → 1, 위로 3px | 300ms 1회 |
| 11 | `anim-sparkle` | star 등급 배지, 홈 미션 완료 카드 제목 이모지 | 반짝 빛(흰 사선)이 1번 지나감 | 1000ms 1회, 화면 들어올 때만 |
| 12 | `anim-lantern` | 헤더 LanternLogo | 위쪽 중심으로 -4deg ↔ 4deg 흔들림 | 3000ms ease-in-out 반복 |
| 13 | `anim-press` | 모든 Button | 누르는 동안 아래로 2px, 그림자 줄어듦 | 120ms (transition) |
| 14 | `anim-medal` | 명예의 전당 1~3위 순위 글자 | 좌우 ±8deg 2번 흔들림 | 600ms 1회 |

공통: 움직이는 속성은 `transform`·`opacity` 만(너비 게이지는 예외로 `width` transition). 반복 움직임은 한 화면에 최대 3개(불꽃·마스코트·로고).

### 6.5 축하 판단 (`client/src/lib/celebrate.ts`) — 서버 변경 없음
- 기존 홈 응답(`me.tier`, `weekPoints`)과 출석 응답만 쓴다.
- 브라우저 `localStorage` 키(학생 ID 별로 나눈다. 교실 PC 공용 대비):
  - `ras.v1.{userId}.lastWeekKey` + `ras.v1.{userId}.lastWeekPoints` — 같은 주(ISO 주차, 예 `2026-W42`)에서 포인트가 늘면 `+{늘어난 값}P` 축하. 주가 바뀌었거나 처음 보는 기기면 축하 없이 값만 저장.
  - `ras.v1.{userId}.lastTier` — `TIER_ORDER` 기준으로 올라갔으면 등급 축하. 처음이면 저장만.
  - `ras.v1.{userId}.stampDate` — 오늘 날짜(Asia/Seoul, `YYYY-MM-DD`)와 다르면 도장 움직임 1번 후 저장.
- 한 번 홈을 열 때 축하 창은 최대 2개(등급 → 포인트 순서).
- vitest: 처음 방문=축하 없음 / 같은 주 증가=축하 / 주 바뀜=축하 없음 / 포인트 감소(회수)=축하 없음 / 등급 상승=축하 / 같은 날 두 번째 방문=도장 움직임 없음. 6개 이상.

### 6.6 화면별 배치
| 화면 | 바꿀 것 |
|---|---|
| LoginPage | 맨 위 `08-login-hero` (가로 꽉, 높이 180px, `object-cover`, `rounded-xl`) → 그 아래 겹치게(-40px) 흰 원 안 `01-mascot-hello` 96px → 사이트 이름 `font-display text-3xl text-accent-700` → 구호. 카드 `anim-pop-in`. 이모지 🏮 제거 |
| HomePage | 로딩 → `PageLoading`. 오류 → EmptyState `illustration="oops"`. 인사 카드 tone `hero`, 왼쪽 흰 원 안 `01-mascot-hello` 64px, 포인트 숫자 `font-display text-3xl text-primary-700` + count-up, 출석 옆 `AttendanceStamp`. 4장 "카드 색 배정"대로 tone 지정. 미션 다 하면 제목 옆 `02-mascot-cheer` 56px. 이번 주 리포트 카드: 상태가 none·draft·rejected 이면 오른쪽에 `05-mascot-write` 72px. 알림·최근 글 빈 화면 → `illustration="sleep"`. `Celebration`·`TierUpModal` 연결 |
| WritePage | PageHeader 아래 `09-activities` (가로 꽉, 높이 160px, `object-cover`, `rounded-xl`). 리포트 카드 tone `primary`, 기사 카드 tone `sky`, 자치회 카드 tone `grape` |
| DebatePage·DebateTopicPage | PageHeader `illustration="think"`, 빈 화면 `think` |
| HallOfFamePage | PageHeader `illustration="trophy"`, 모든 빈 화면 `trophy`, 1~3위 순위에 🥇🥈🥉 + `anim-medal`, 1위 줄 바탕 `sun-100` |
| MyPage | "내 등급" 카드 오른쪽 `10-mascot-shine` 64px, 칭호 칸: 얻은 것 `bg-sun-100`, 대표 칭호 `border-primary-600`(유지) |
| MyPointsPage | 합계 카드 tone `hero` + count-up, `+` 줄 글자 `mint-700`, 회수 줄은 기존 `danger-600` 유지, 빈 화면 `sleep` |
| PostListPage·CouncilListPage | 빈 화면 `sleep` |
| ReviewQueuePage | "검토할 글이 없어요" → `cheer` |
| PostDetailPage·CouncilPostPage·ReviewPostPage | 오류·없는 글 → `oops` |
| PlaceholderPage | `oops` |
| ChangePasswordPage | 색·카드만 새 토큰 (그림 없음) |
| TeacherShell | 6.2 규칙대로 로고·띠만 |

### 6.7 그림 변환 (`scripts/convert-illustrations.mjs`)
- 입력 `outputs/art/NN-*.png` → 출력 `client/public/illustrations/NN-*.webp` (3.6 표 크기, `fit: 'cover'`).
- 마스코트: 512x512, webp quality 80 / 큰 그림: 960x640, quality 78. 상한 넘으면 quality 를 5씩 낮춰 최대 2번 다시.
- 실행: `node scripts/convert-illustrations.mjs` (sharp 는 server 의존성에 이미 있음).
- coder 마지막 단계에서 `outputs/art/` 에 PNG 10장이 있으면 실행, 없으면 스크립트만 두고 보고서에 "변환 대기"로 적는다(그림 없을 때도 화면이 깨지지 않게 `img` 에 width/height 고정).

### 6.8 끝내기 전 확인
`npm test`, `npm run lint`, `npm run build`(client) 통과. Playwright 360px·1280px 스크린샷(6.1 경로).

---

## 7. 제안 (이번 범위 밖, 사용자 승인 필요)
- 제안: Jua·Pretendard 글꼴 파일 직접 넣기(외부 다운로드라 사용자 확인 필요).
- 제안: motion-director 로 학부모·학생 안내용 15초 소개 영상(1080x1920, 30fps, mp4) — 오픈 공지용. 웹앱 안에는 넣지 않음.
- 제안: PWA 앱 아이콘(icons/*.png)을 초롱이 얼굴로 교체 — 이번 10장에는 포함하지 않음.

---

## 8. consistency-checker 체크리스트 (기계적으로 대조)
파일 존재·개수
- [ ] `outputs/art/` 에 3.6 표의 PNG 10개가 정확한 이름으로 있다.
- [ ] 01~07, 10 PNG 크기 1024x1024, 08·09 는 1536x1024.
- [ ] `client/public/illustrations/` 에 같은 이름 webp 10개. 마스코트 512x512, 08·09 960x640.
- [ ] webp 용량: 마스코트 각 ≤ 60KB, 08·09 각 ≤ 120KB, 합계 ≤ 700KB.
- [ ] `client/src/lib/illustrations.ts` 의 경로 10개가 실제 파일과 1:1 로 맞는다.
- [ ] 새 파일 존재: `styles/motion.css`, `lib/motion.ts`, `lib/celebrate.ts`, `lib/celebrate.test.ts`, `components/fun/` 아래 7개(Mascot, Confetti, Celebration, TierUpModal, AttendanceStamp, PageLoading, LanternLogo), `scripts/convert-illustrations.mjs`.
- [ ] 스크린샷: `outputs/code/screens/` 에 360px 7장 + 1280px 2장 = 9장.

색·토큰 값 (tokens.css 문자열 대조)
- [ ] 3.2 표의 HEX 23개가 그대로 있다. `primary-600 #c96a0f`, `primary-700 #a3540b`, `accent-600 #1e3a5f`, `ink #1f2937` 은 바뀌지 않았다.
- [ ] `--gradient-hero`, `--gradient-rainbow`, `--shadow-pop`, `--shadow-pop-soft`, `--font-display` 가 3.2~3.4 값과 같다.
- [ ] `--radius-sm/md/lg/xl` = 10/14/20/28px.
- [ ] `--text-base` = 1rem, `--spacing-tap` = 44px, `--spacing-tab-bar` = 64px (유지).

접근성·규칙
- [ ] `client/src` 에서 새로 추가된 `text-xs`, `text-sm`, `text-[1Npx]`(16 미만) 사용 0건.
- [ ] Button 에 `min-h-tap`·`text-base`(md) 유지, `Button.test.tsx` 통과.
- [ ] `motion.css` 에 `prefers-reduced-motion: reduce` 블록이 있고 `.anim-*` 를 모두 끈다.
- [ ] 6.4 의 14개 모션 클래스/컴포넌트가 존재하고, 각 길이·반복 숫자가 6.4 표의 "길이·반복" 칸과 같다.
- [ ] 모든 `<img>` 일러스트에 `alt=""`, `width`, `height` 가 있다.
- [ ] 3.1 새 문구 8개가 글자 그대로 쓰였고, 새 문구에 반말 어미(~다., ~야, ~자) 없음.
- [ ] 이미지 PNG 10장에 글자·숫자 없음(눈으로 확인).
- [ ] `client/package.json`·루트 `package.json` dependencies 에 새 패키지 0개.
- [ ] `server/` 폴더 변경 0건, 기존 `data-testid` 삭제 0건.
- [ ] "시연" 글자가 새로 추가되지 않았다.
- [ ] `npm test`, `npm run lint`, client build 통과 기록이 `outputs/03-code-report.md` 에 있다.

---

## 9. 가정 (근거 없이 정한 값)
- 마스코트 이름 "초롱이"와 생김새(청사초롱)는 사이트 이름·기존 🏮 이모지에서 따왔다.
- 새 색 5계열(sun·mint·sky·berry·grape) HEX 와 700 단계의 흰 바탕 대비 4.5:1 이상은 계산 추정값이다. coder 가 대비를 다시 확인하고 미달이면 같은 색 계열로 더 진하게 고쳐 보고한다.
- 일러스트 크기는 Codex 이미지 도구가 확실히 지원하는 1024x1024·1536x1024 로만 정했다.
- Codex 가 투명 배경을 확실히 만든다는 근거가 없어 마스코트는 흰 바탕으로 받고, 화면에서 흰 원/흰 카드 위에만 둔다.
- 02~10 에서 "01 그림을 보고 같은 캐릭터 유지" 지시가 Codex 에서 실제로 먹히는지는 미확인이다. 안 되면 캐릭터 문장만으로 그린다.
- 축하 판단을 브라우저 localStorage 로 한 것은 "서버·API 변경 없음" 결정 때문이다. 다른 기기에서는 축하가 한 번 더 나오거나 안 나올 수 있다.
- 모션 길이(280ms 등)·webp 품질(80/78)·용량 상한(60/120/700KB)은 저사양 기기와 학교 망을 고려한 경험값이다.
