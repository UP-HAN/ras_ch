# 3차 운영 기능 계획 초안: 백업 지점 · 버그 신고 게시판 · 지난 학년도 보기

사용자 요청(2026-10-05). 2026학년도는 시범 4개 학급으로 운영을 시작한다. 아래는 코드·서버 도구 조사 결과와 설계 초안이며, **아직 구현하지 않았다.** "정해야 할 것 4가지"를 사용자에게 확인받은 뒤 계획 모드로 다시 확정하고 시작한다.

추천 순서: A 백업 지점(시범 운영 전) → B 버그 신고 게시판 → C 지난 학년도 보기(2027년 2월 전까지).

## 정해야 할 것 4가지 (추천안 표시)

1. **복원 실행 방식**: 관리자 화면 버튼(확인 문구 입력 + 복원 직전 자동 백업, 1~2분 중단) ← 추천 / Claude 에게 요청(서버 스크립트만).
2. **자동 백업 주기**: 매일 새벽 + 수동(자동 14일 보관, 수동은 지울 때까지) ← 추천 / 하루 2번 / 매주.
3. **버그 신고 범위**: 학생·교사 모두 신고, 본인 글과 관리자 답변만 열람 ← 추천 / 모두 열람 / 교사만 신고.
4. **지난 학년도 열람 범위**: 관리자·승인 교사만(읽기 전용) ← 추천 / 모든 교사(자기 옛 반만) / 학생도 자기 기록.

## 설계 초안 (조사 결과 요약)

### A. 백업 지점 (시범 운영 전 가장 먼저)

- 지금: `deploy/backup.sh` 가 cron 으로 DB 매일 03:10, uploads 는 일요일만 → DB 와 사진이 짝이 안 맞음. 30일 지나면 삭제. **운영 복원 절차·스크립트 없음**(복원 코드는 ras_demo 전용 `demo-refresh.sh snapshot` 뿐).
- 만들 것:
  - `deploy/restore-point.sh create <label>|list|restore <id>|prune`: DB dump + uploads 를 한 묶음으로 `/var/backups/ras-point/points/<id>/` 에 저장, `manifest.json`(라벨·시각·git 커밋·마지막 마이그레이션·크기·만든 사람). `.env` 의 `DB_NAME` 이 인스턴스와 일치하지 않으면 중단(다른 앱·DB 보호), 비밀번호는 `--defaults-extra-file`.
  - `restore`: 복원 직전 자동 안전 백업 → `pm2 stop` → DB·uploads 교체 → `npm run db:migrate` → `pm2 start`. Node 가 자기 자신을 멈출 수 없으므로 분리된 프로세스로 실행.
  - 목록은 DB 밖(manifest 파일)에 둔다 — DB 안에 두면 복원 때 같이 되돌아감. 복원하면 세션이 초기화되어 모두 다시 로그인.
  - 관리자 화면 `/teacher/admin/backups`(지금 백업·목록·삭제·복원), 복원은 기존 `ConfirmDialog` 의 `requireText` 사용. 서버 `routes/adminBackups.ts`(admin 전용, `writeAudit`).
  - cron 을 "매일 지점 생성 + 오래된 자동 지점 정리"로 교체. 디스크: 사진 묶음이 커지므로 보관 개수 상한.

### B. 버그 신고 게시판

- 본보기: 공지(noticeRepo → NoticeService → routes/admin.ts → ContentPage), 사진은 `processPhotos`(PostService.ts), 알림 `lib/notify.ts`.
- 만들 것: `server/migrations/008_bug_reports.sql`(bug_reports: reporter, title, body, page_path, status 접수/확인 중/해결/보류, admin_reply, 캡처 1장), `repos/bugReportRepo.ts`, `lib/bugReportRules.ts`(+test), `services/BugReportService.ts`, `routes/bugReports.ts`(로그인 사용자: 작성·내 신고 / admin: 전체·상태·답변), `routes/uploads.ts` 에 캡처 열람 권한(신고자·관리자) 추가, `notify` 타입 `bug_report`.
- 클라이언트: `pages/common/BugReportPage.tsx`(작성 + 내 신고 목록, 학생·교사 공용), `pages/teacher/admin/BugReportsPage.tsx`(목록·상태·답변), 학생은 내 정보 "계정" 카드에 진입 버튼, 교사 메뉴 "버그 신고", 관리자 메뉴 "버그 신고함"(열린 건수 배지).
- 주의: 학생 응답에 실명 없음, 문구는 존댓말, 교사에게는 알림 화면이 없어 "내 신고" 목록으로 확인.

### C. 지난 학년도 보기 (2027년 2월 전까지)

- 지금: 학년도를 가진 것은 `classes.school_year_id` 뿐. 반 id 를 받는 교사 API 는 2026 반 id 를 주면 이미 동작하지만, 반 목록·배지가 현재 학년도만 내려줘서 화면에서 갈 길이 없음.
- 만들 것(읽기 전용 보관함):
  - 서버: `GET /teacher/school-years`, `/teacher/classes?school_year_id=`(+pending-counts, 댓글 범위, 신고함, 전교 통계, 실천 변화 리포트). 전교 목록(글·토론·자치회·명예의 전당 월 목록)에 학년도 필터. 지난 학년도 반에는 승인·반려·숨김·칭찬·비밀번호 초기화 등 쓰기 금지(`isCurrentYearClass` 검사). 대시보드·CSV 는 그 학년도의 마지막 주 기준, 지난 반에서 학급 미션 기록 쓰기 금지.
  - 클라이언트: 교사 셸 상단 학년도 선택(`useYearParam`, 캐시 키에 학년도), 보관함 배너와 동작 버튼 비활성.
- 같이 해야 하는 "학년도 넘기기" 안전장치(안 하면 자료가 섞임):
  - 새 학년도 시작 버튼에 확인 단계 + 지난 학년도 학생 일괄 졸업 처리·로그인 차단, 자치회 임원·검토 담당 임기 종료.
  - 주간 TOP·월간 결산은 `currentSchoolYear()` 대신 해당 주·월이 속한 학년도 명단으로(2월 결산·마지막 주가 새 명단으로 계산되는 문제).
  - 검토 대기열·전교 글 목록이 학년도를 넘어 섞이지 않게.

## 검증 (구현 때)

- A: 로컬 포터블 MySQL 에서 create → 데이터 변경 → restore → 원상 확인, DB_NAME 가드, ras_demo 에서 먼저 리허설 후 운영 적용.
- B: vitest(규칙·권한 400/401/403), e2e(학생 신고 → 관리자 답변·해결 → 학생 알림), 360/1280 스크린샷.
- C: 로컬에서 2027 학년도를 만들어 넘긴 뒤 2026 보관함 열람·쓰기 차단·결산 명단 테스트.
