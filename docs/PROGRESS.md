# 진행 기록

스프린트가 끝날 때마다 Claude Code가 아래 형식으로 추가한다.

## 형식

### YYYY-MM-DD — S0 골격

- 만든 것:
- 충족한 PRD ID:
- 남은 것:
- 다음 스프린트 리스크:

---

### 2026-09-23 — S0 골격 (0-1 ~ 0-4)

- 만든 것: npm workspaces 모노레포(client/server), TypeScript 6·ESLint 10·Prettier·vitest 5 설정, docker-compose(MySQL 8.0), `.env.example`, README. 자체 마이그레이션 러너 + `001_init.sql`(31 테이블) + `002_sessions.sql`. 시드(2026학년도, 3~6학년 4반, 교사 4, 학생 30, 규칙 24, 설정 15, two_step, 임원 2 + 검토 담당). 시간·주차 유틸, 마스킹 이름, 허용목록 직렬화 3종(검토자/학생/교사), 상한 검사 순수 함수, `PointService` 계약+스텁, 결산 타입·설계 메모, Express 앱(/healthz, /api/v1/ping, 세션 스토어, 에러 규격), Tailwind v4 토큰, UI 6종, 학생 하단 탭 셸·교사 좌측 메뉴 셸, 자리 페이지. 테스트 53개.
- 충족한 PRD ID: 8장·8.1(스키마·인덱스), 7.1(규칙표 시드), 7.5(원장 제약: event_key UQ, reversal_of UQ, amount≠0), 3.1(display_name 생성·중복 병기), APR-02c(검토자 응답에 작성자 식별 필드 없음 — 직렬화 테스트), RPT-01(주 1건 유니크 — 생성 컬럼), APR-01(two_step 기본), CMN-01·6장(셸), 10장(16px·44px·가로 스크롤 없음 스크린샷 확인), 11장(/healthz).
- 남은 것: 로그인·권한 미들웨어(S1), PointService 구현(S4), 결산 산식(S5). 이 PC에는 Docker·MySQL이 없어 검증은 스크래치 폴더의 포터블 MySQL 8.0.46으로 수행함 — 개발 계속하려면 Docker Desktop 설치 또는 로컬 MySQL 준비 필요.
- 다음 스프린트 리스크: S1에서 세션·역할 미들웨어를 `requireRole()` 한 곳으로 통일해야 이후 403 테스트가 단순해짐. 교사 검토 계정(APR-12) 역할 전환은 세션의 actingAs 필드로 이미 자리를 잡아 둠.

### 2026-09-23 — S1 계정·역할 (1-1 ~ 1-6)

- 만든 것: 로그인/로그아웃/비밀번호 변경 API + 세션(30일)·잠금(5회/10분)·첫 로그인 변경 강제, `requireRole()`/`requireClassAccess()`/CSRF 헤더 미들웨어, 학생 CSV 일괄 등록(dry run·EUC-KR 대응·반 자동 생성·display_name 재계산), 관리자 API(학년도·반·교사·역할·학생 수정·동의 철회 시 이미지 삭제 대기), 담임 비밀번호 초기화, `/me`·`/me/home`·알림 API, audit_logs 마이그레이션. 클라이언트: 로그인·비밀번호 변경·라우트 가드·학생 홈(실데이터)·학생 관리·학교 설정·CSV 등록 화면. 테스트 94개(권한 403 매트릭스, 잠금, CSV 검증 포함).
- 충족한 PRD ID: AUTH-01, 02, 03, 04, 05, 06, 07, 08, 09(이미지 삭제 대기 표시), 3.1(학생 ID·display_name), ADM-01, PATCH /admin/students/:id, PUT /admin/teachers/:id/roles, 9.1(/auth/*, /me), 6.1·CMN-05(홈 골격), 10장(CSRF·감사 로그).
- 남은 것: 출석 포인트(3-4)는 로그인 훅 자리만 둠. 홈의 "리포트 올리기" 버튼은 S2 작성 화면에 연결. 반 대시보드 지표(5-5).
- 다음 스프린트 리스크: S2 이미지 업로드는 `parent_consent='N'`이면 캡처형을 서버에서 거부해야 함(AUTH-08, 절대 규칙 5) — `req.user.row.parent_consent`로 판단 가능. 리포트 상태 전이는 `PostService.transition()` 한 곳으로 시작할 것.
