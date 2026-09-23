# 초롱 RAS 포인트 — 프로젝트 지침 (CLAUDE.md)

초롱초등학교 3~6학년 학생의 폰프리 실천·RAS 활동을 포인트로 모아 보상하는 웹앱.
모든 요구사항의 원본은 `docs/PRD.md`(개발요구계획서)이고, 배경·운영 방식은 `docs/PLAN.md`에 있다.
**요구사항 ID(RPT-06, APR-02c 등)를 코드 주석·커밋 메시지·테스트 이름에 그대로 인용한다.**

## 지금 할 일

- 현재 단계: **1차 개발(시범 오픈용)**. 범위는 `docs/TASKS-phase1.md`의 작업 목록만. 2·3차 기능(토론방, 자치회 게시판, 설문, 안건, 방학 모드, LLM, 상장 PDF)은 만들지 않는다 — 다만 DB 스키마와 댓글·좋아요·신고 파이프라인은 나중에 붙을 것을 감안해 일반화한다(PRD 8.1 참조).
- 작업 순서는 `docs/TASKS-phase1.md`의 번호 순서를 따르고, 한 작업이 끝나면 목록의 체크박스를 직접 갱신한다.
- 새 기능을 시작하기 전에 PRD의 해당 요구사항 ID를 먼저 읽고, 모호하면 구현 전에 질문한다. 임의로 요구사항을 바꾸지 않는다.

## 기술 스택 (PRD 11장)

- 프론트: React 18 + Vite + TypeScript, Tailwind CSS, react-router, TanStack Query. 모바일 우선(360px~), 교사 화면은 PC 우선. PWA(manifest + 최소 service worker)
- 백엔드: Node 20 + Express + TypeScript, REST `/api/v1`, 세션 쿠키(HttpOnly, SameSite=Lax), bcrypt
- DB: MySQL 8, 스키마명 `ras_point`. 마이그레이션은 `server/migrations/`에 SQL 파일(번호 접두어)로 관리. ORM 없이 `mysql2` + 얇은 쿼리 레이어(또는 Kysely). 원장·집계 쿼리는 SQL로 직접 쓴다
- 이미지: `sharp`로 긴 변 1280px 리사이즈 + EXIF 제거 후 `server/uploads/` 저장(경로만 DB). 업로드 5MB, jpg/png/webp만
- 배치: `node-cron` (주간 TOP 월 00:05, 월간 결산 초안 매월 1일 00:05, 카운트 재검증 03:00). 시각은 Asia/Seoul
- 배포 대상: AWS Lightsail Ubuntu, nginx 리버스 프록시, pm2, 서브도메인 ras.ches.es.kr. 개발 중에는 로컬 MySQL(Docker) 사용

## 디렉터리

```
/client        React 앱 (src/pages, src/components, src/api, src/lib)
/server        Express 앱 (src/routes, src/services, src/repos, src/jobs, migrations/, uploads/)
/docs          PRD.md, PLAN.md(기획서), TASKS-phase1.md, PROGRESS.md, START-PROMPTS.md, seed/
/scripts       개발용 스크립트(시드, 계정 CSV 예시)
```

## 절대 지켜야 할 규칙

1. **포인트는 원장(point_ledger)에만 기록한다.** 합계 컬럼을 두고 더하지 말 것. 모든 지급은 `PointService.apply(event)` 한 곳을 거치고, 상한 검사는 원장을 집계해서 판단한다(PT-01, PT-02, 7.5). 회수는 `reversal_of`를 가리키는 음수 행(PT-03).
2. **권한은 서버에서 검사한다.** 학생이 타 반·교사 API를 호출하면 403(AUTH-07). 역할: student / student+council / teacher / teacher+approver / teacher+grade_advisor / admin / council_teacher(교사 검토 계정). 미들웨어 `requireRole()`로 통일.
3. **익명 검토(APR-02c, 02d)**: 학생 검토자에게 내려가는 응답에는 작성자 식별 필드(user_id, name, display_name, class_id, student_no, tier)를 **서버에서 제거**한다. 프론트에서 숨기는 것으로 끝내지 않는다. 본인 글·같은 반 글은 쿼리 단계에서 제외.
4. **표시 이름은 서버가 만든다**(3.1): `display_name = 성 + '○' + 이름 끝 글자`(2글자 이름은 `성○`, 4글자 이상은 가운데 모두 ○). 같은 반에 중복이면 `(번호)` 병기. 학생용 API는 실명(name)을 절대 내려보내지 않는다. 교사용 API만 name 포함.
5. **학부모 동의(AUTH-08)**: `parent_consent = 'N'`이면 캡처형 리포트 작성 API를 거부하고 일기형만 허용. 다른 활동은 모두 허용.
6. **승인 상태 흐름**(RPT-06): `draft → pending → [reviewed | flagged] → approved | rejected | hidden`. 승인 시에만 포인트 지급, 반려·삭제·숨김 시 회수. 상태 전이는 `PostService.transition()` 한 곳에서.
7. **시간·주차**: 서버 시각은 Asia/Seoul로 고정, 주차 키는 ISO 8601(`2026-W38`, 월요일 시작). 날짜 라이브러리는 `dayjs` + timezone/isoWeek 플러그인만 사용.
8. **개인정보**: 로그에 학생 이름·이미지 경로를 남기지 않는다. 업로드 원본은 저장하지 않는다(리사이즈본만).

## 코딩 규칙

- TypeScript strict, ESLint + Prettier 기본 설정. `any` 금지(불가피하면 주석으로 사유).
- API 응답은 `{ ok: true, data } | { ok: false, error: { code, message } }`로 통일. 에러 메시지는 학생이 읽을 수 있는 한국어("사진이 너무 커요. 5MB 이하로 올려 주세요").
- 프론트 문구는 초등 3학년이 읽을 수 있는 쉬운 한국어. 버튼 44px 이상, 글자 16px 이상(10장).
- 각 서비스 함수에는 단위 테스트(vitest). 특히 포인트 규칙·상한·회수, 주차 계산, 마스킹 이름, 익명 검토 응답 필터링, 월간 결산 산식(성장률·연속 선정 제한)은 반드시 테스트.
- 커밋은 작업 단위로 작게. 메시지 형식: `feat(server): 리포트 승인 시 포인트 지급 (RPT-06, PT-02)`.

## 명령어

```bash
# 최초 1회
docker compose up -d mysql            # 로컬 MySQL 8 (ras_point)
npm install                           # 루트(workspaces: client, server)
npm run db:migrate                    # server/migrations 적용
npm run db:seed                       # 시범용 반·교사·학생 30명 + 규칙표 + 설정

# 개발
npm run dev                           # client(5173) + server(3000) 동시 실행
npm test                              # vitest 전체
npm run lint
```

`.env.example`을 복사해 `.env`를 만든다(DB 접속, SESSION_SECRET, UPLOAD_DIR). 실제 비밀값은 커밋하지 않는다.

## 작업 방식

- 큰 작업(스프린트 항목)은 먼저 **계획 모드**로 파일 목록·스키마·API 초안을 보여 주고 확인받은 뒤 구현한다.
- 구현 후에는 `npm test`와 `npm run lint`를 통과시키고, 무엇을 만들었는지·PRD의 어느 ID를 충족했는지·남은 것은 무엇인지 3~5줄로 보고한다.
- 화면을 만들었으면 브라우저(Playwright)로 모바일 360px과 PC 1280px 스크린샷을 찍어 확인한다.
- PRD와 충돌하는 결정을 해야 하면 구현하지 말고 선택지를 제시한다.
