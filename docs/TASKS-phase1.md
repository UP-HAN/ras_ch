# 1차 개발 작업 목록 (시범 오픈까지)

PRD 12.1 기준. 번호 순서대로 진행하고, 끝난 항목은 `[x]`로 바꾼다. 각 항목 끝의 괄호는 충족해야 할 PRD 요구사항 ID.

## S0 — 골격

- [x] 0-1 모노레포 생성: 루트 `package.json`(workspaces client/server), TypeScript·ESLint·Prettier·vitest 설정, `docker-compose.yml`(MySQL 8), `.env.example`, README에 실행 순서
- [x] 0-2 DB 마이그레이션 프레임 + 1차 스키마: school_years, classes, users, teacher_classes, posts, report_details, article_details, post_images, comments(target_type/target_id), likes, reports, point_rules, point_ledger, weekly_scores, monthly_settlements, monthly_scores, monthly_awards, notifications, settings, login_days, post_reads, council_members, review_assignments, review_logs, approval_settings, comment_review_checks (PRD 8장·8.1 인덱스)
- [x] 0-3 시드 스크립트: 2026학년도, 3~6학년 각 1개 반, 교사 4명(1명 admin·approver, 1명 grade_advisor), 학생 30명(동의 Y/N 섞기, 기자단 2명, 임원 2명), 규칙표(7.1 전체), settings 기본값, approval_settings(two_step)
- [x] 0-4 디자인 토큰·공통 컴포넌트: 색·글자 크기(16px+)·버튼(44px+), 하단 탭 5개 셸(홈/글쓰기/토론방(비활성)/명예의 전당/내 정보), 교사용 좌측 메뉴 셸 (CMN-01, 6장)

## S1 — 계정·역할

- [x] 1-1 로그인/로그아웃/세션 30일, 첫 로그인 비밀번호 변경 강제, 5회 실패 잠금 (AUTH-01, 02, 06)
- [x] 1-2 역할 미들웨어 `requireRole()` + 학생의 타 반·교사 API 403 테스트 (AUTH-07)
- [x] 1-3 학생 CSV 일괄 등록(학년,반,번호,이름,초기비밀번호,학부모동의,기자단), 학년 3~6 검증, 중복 검사, display_name 자동 생성·동명 번호 병기 (AUTH-03, 3.1)
- [x] 1-4 관리자: 반·교사 관리, 교사 역할 지정(is_approver, advisor_grade_group), 학생 개별 수정(동의·기자단·상태) (ADM-01, PATCH /admin/students/:id)
- [x] 1-5 담임: 비밀번호 초기화 (AUTH-04)
- [x] 1-6 학생 홈 골격: 이름·등급 자리·이번 주 포인트·리포트 상태 카드·알림 카드 (6.1, CMN-05)

## S2 — 폰프리 주간 리포트

- [x] 2-1 리포트 작성 API/화면: 캡처형(이미지 2장 + 수치 + 성찰글 100~1000자 + 목표) / 일기형(캡처 없음). parent_consent=N이면 캡처형 거부 (RPT-01, 02, 09, AUTH-08)
- [x] 2-2 이미지 업로드: sharp 리사이즈 1280px·EXIF 제거·5MB·MIME 검증, 원본 미보관 (RPT-04)
- [x] 2-3 캡처 안내 화면(삼성/안드로이드/아이폰) + "이름 보이는 화면 캡처 금지" 안내 (RPT-05, 부록 B, APR-02d)
- [x] 2-4 상태 흐름 `PostService.transition()`: draft→pending→approved/rejected(교사 단독 모드), 승인 전 본인 수정 (RPT-06)
- [x] 2-5 지난주 대비 변화 계산·표시, 지난주 목표 달성 체크 (RPT-08, RPT-03)
- [x] 2-6 공개 범위(우리 반/전교) + 목록·상세, 학생용 응답에서 실명 제거 (RPT-07, 3.1)
- [x] 2-7 교사 승인 대기함(단독 모드): 개별 승인/반려(사유), 선택 일괄 승인 (TCH-02 기본형)

## S3 — 기사·반응·댓글 점검

- [x] 3-1 기사 작성·수정·승인·목록(최신/엄지척/영역 필터)·상세, 유형 템플릿, 기자단 배지 표시·필터 (ART-01~04, ART-07)
- [x] 3-2 좋아요(게시글·댓글, 1회·취소), 댓글(10~300자, 글당 3개), 금칙어 필터, 신고 3회 자동 숨김, 본인 글 제외 (RCT-01~06)
- [x] 3-3 댓글·좋아요·신고를 target_type/target_id로 일반화(리포트·기사 공통, 나중에 토론·자치회 추가 가능) (8.1)
- [x] 3-4 출석 이벤트(login_days, 연속 일수) + 읽기 이벤트(/me/read, 10초+스크롤 검증, 글당 1회·일 5회) (PT-09, PT-10)
- [x] 3-5 **댓글 모아보기**: 반/학년/학년군/기간/신고됨 필터, 숨김·정형 안내, 확인 시각 기록·미확인 건수 (TCH-06, 07)
- [x] 3-6 알림 카드(인앱): 승인·반려·포인트·선정 (CMN-03)

## S4 — 포인트 엔진·2단계 승인

- [ ] 4-1 `PointService.apply(event)`: 규칙표 조회 → 상한 검사(일/주/월/객체, 원장 집계) → 원장 insert. 규칙 코드 7.1 전체(1차 범위: REPORT__, GOAL_CHECKED, ARTICLE_APPROVED, REPORTER_BONUS, COMMENT_WRITTEN, LIKE__, DAILY_LOGIN, STREAK_7, POST_READ, REVIEW_DONE, TEACHER_BONUS, MONTHLY_TOP, GROWTH_AWARD, MONTHLY_AWARD, WEEKLY_GIFT) (PT-01, 02, 05)
- [ ] 4-2 회수: 반려·삭제·숨김·좋아요 취소 시 reversal 행, 재계산(리빌드) 관리자 기능 (PT-03, PT-08)
- [ ] 4-3 교사 칭찬 포인트(사유·주 한도), 내 포인트 화면(주/월/누적·내역) (PT-04, PT-06)
- [ ] 4-4 관리자 포인트 규칙 편집 화면 (PT-05, ADM-02)
- [ ] 4-5 승인 모드 설정(학교 기본 two_step, 반/학년 덮어쓰기), 검토 담당 설정 기본형(담당자·학년·글 유형·허용 결과·하루 상한) (APR-01, 02, 02a)
- [ ] 4-6 **익명 1차 검토 화면**(학생 임원): 담당 범위 pending 목록(작성자 정보 서버에서 제거, 본인·같은 반 제외), 체크리스트, 통과/보류 요청(사유 20자+), 이미지 상단 10% 마스크, REVIEW_DONE 지급 (APR-02c, 02d, 03, 04, 09)
- [ ] 4-7 교사 대기함 3구간(1차 통과/보류 요청/미검토) + "1차 통과 전체 승인" + 직접 승인, 48시간 자동 승격, 검토 이력 (APR-05, 06, 07, 08, TCH-02)
- [ ] 4-8 교사용 자치회 검토 계정 생성·연결, `/me/switch-role` 역할 전환, 자동 2차 승인 설정(기본 꺼짐), 교사 검토 계정 포인트 미지급 (APR-12~15)
- [ ] 4-9 단위 테스트: 규칙·상한·회수, 주차 계산(연말 경계), 마스킹 이름, 익명 응답 필터, 권한 403 (13장)

## S5 — 결산·명예의 전당·교사 화면

- [ ] 5-1 주간 TOP 배치(월 00:05): weekly_scores 스냅샷, 학년별 10명·반별 평균. 학생 화면은 순위·포인트 없이 명단만, 교사 화면은 순위 표시 (HOF-01)
- [ ] 5-2 월간 결산 초안 배치(1일 00:05): 포인트 상위 5명, 성장률 3명(자격 조건), 3부문 후보(7.2~7.4 산식), 학급 보상 1반(동점 시 참여율), 연속 선정 제한 자동 넘김·표시 (HOF-02, 02a, 02b, 02c, 03, 04)
- [ ] 5-3 월간 결산 확정 화면(승인 권한 교사): 인원 조정, 3부문 선정·이유, 예외 허용, 확정 시 포인트 지급·알림, 선물 명단 CSV (HOF-05, 08, ADM-03)
- [ ] 5-4 명예의 전당 4탭(주간 TOP/월간/학급/역대) (HOF-06)
- [ ] 5-5 교사 반 대시보드(제출률·대기·평균·미참여), 반 통계 CSV, 관리자 전교 통계 (TCH-01, 05, ADM-05)
- [ ] 5-6 관리자 공지(홈 배너·기간), 안내 문구 편집 (ADM-04, 07)
- [ ] 5-7 PWA(manifest·아이콘·오프라인 안내), 목록 무한 스크롤·이미지 지연 로딩 (CMN-02, 04)
- [ ] 5-8 성능 점검: 목록 API 500ms, 동시 업로드 50건, 모바일 360px·PC 1280px 스크린샷 확인 (10장, 13장)
- [ ] 5-9 배포 준비: pm2 설정, nginx 서버 블록 예시, 백업 스크립트(DB 일 1회·이미지 주 1회), `/healthz` (11장)

## 시범 운영 전 체크

- [ ] 시드 계정으로 학생→임원 검토→교사 승인→포인트→월간 결산까지 end-to-end 1회
- [ ] 6학년 1~2개 반 실제 계정 CSV 등록(동의 열 반영), 담임 1명·approver 1명·grade_advisor 1명 역할 지정
- [ ] 캡처 안내 이미지·문구 최종 확인, 금칙어 목록 초기 등록
