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

### 2026-09-23 — S2 폰프리 주간 리포트 (2-1 ~ 2-7)

- 만든 것: 리포트 작성·수정·삭제 API(캡처형/일기형, 이번 주·지난주 선택, 주 1건), sharp 이미지 처리(긴 변 1280·EXIF 제거·webp, 원본 미보관), 로그인·열람 권한을 검사하는 이미지 라우트, `PostService.transition()` 상태 전이 한 곳(승인 시 `PointService.apply` 훅, 반려·숨김·삭제 시 회수 훅), 지난주 대비 변화·목표 달성 체크, 목록(우리 반/전교, 커서 페이지네이션)·상세(학생 뷰 실명 없음), 교사 승인 대기함(개별 승인/반려 사유 프리셋/선택 일괄 승인)·반 글 목록(숨김/해제), review_logs·audit_logs 기록. 클라이언트: 캡처 안내(기기 탭·경고), 작성 폼(문장 도우미·글자 수·이미지 미리보기), 상세·목록·홈 연결, 승인 대기함·반 글 목록. 테스트 129개(전이표·주차 규칙·diff·열람 권한·이미지 처리·입력 검증·동의 N 403).
- 충족한 PRD ID: RPT-01, 02, 03, 04, 05, 06(교사 단독 흐름), 07, 08, 09, AUTH-08(캡처형 서버 거부), APR-06(교사 직접 승인), TCH-02 기본형, TCH-04(숨김), 9.2 /posts·/teacher/posts, 부록 B, 절대 규칙 3·4·5·6·8.
- 남은 것: 포인트 실제 지급은 S4(지금은 NOT_IMPLEMENTED 를 warn 으로 넘김). 임원 1차 검토·익명 화면·이미지 상단 마스크(S4 4-6), 대기함 3구간(S4 4-7), 좋아요·댓글(S3), 리포트 그래프(RPT-10).
- 다음 스프린트 리스크: S3 기사는 같은 posts 테이블·같은 transition 을 쓰므로 `type='article'` 분기와 article_details 만 추가하면 됨. 댓글·좋아요는 target_type 로 일반화되어 있으니 리포트·기사 공통 파이프라인으로 한 번에 만들 것. 신고 3회 자동 숨김은 transition('hide', system) 경로 필요 → actor 에 system 허용.
