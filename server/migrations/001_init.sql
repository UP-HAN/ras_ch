-- 001_init.sql — 1차 개발 스키마 (PRD 8장, 8.1 인덱스, TASKS 0-2)
-- MySQL 8.0 / utf8mb4_0900_ai_ci / DATETIME(3)은 Asia/Seoul 벽시계 값
-- 공통: id BIGINT UNSIGNED PK, created_at/updated_at
-- FK 기본 ON DELETE RESTRICT (원장·이력 무결성), 종속 상세 테이블만 CASCADE

-- =========================================================
-- 학년도·반·사용자
-- =========================================================
CREATE TABLE school_years (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year        SMALLINT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_current  TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_years_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- users 는 classes 와 상호 참조라 class_id FK 는 classes 생성 뒤에 붙인다
CREATE TABLE users (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login_id                  VARCHAR(64) NOT NULL,
  password_hash             VARCHAR(100) NOT NULL,
  role                      ENUM('student','teacher','admin','council_teacher') NOT NULL,
  is_approver               TINYINT(1) NOT NULL DEFAULT 0,
  advisor_grade_group       ENUM('3-4','5-6') NULL,
  name                      VARCHAR(30) NOT NULL,
  -- 성 + ○ + 끝 글자, 같은 반 중복 시 "(번호)" 병기. 서버가 생성 (3.1)
  display_name              VARCHAR(40) NOT NULL,
  class_id                  BIGINT UNSIGNED NULL,
  student_no                TINYINT UNSIGNED NULL,
  -- 학부모 동의: 캡처 이미지 업로드에 한정 (AUTH-08)
  parent_consent            ENUM('Y','N') NOT NULL DEFAULT 'N',
  consent_updated_at        DATETIME(3) NULL,
  is_reporter               TINYINT(1) NOT NULL DEFAULT 0,
  -- 누적 포인트로 재계산되는 캐시 (PT-07, 2차)
  tier                      ENUM('seed','sprout','flower','fruit','star') NOT NULL DEFAULT 'seed',
  -- 교사 → 연결된 자치회 검토 계정 (APR-12)
  linked_council_account_id BIGINT UNSIGNED NULL,
  status                    ENUM('active','transferred','graduated','disabled') NOT NULL DEFAULT 'active',
  must_change_pw            TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_count        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until              DATETIME(3) NULL,
  last_login_at             DATETIME(3) NULL,
  created_at                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_login_id (login_id),
  UNIQUE KEY uq_users_class_student_no (class_id, student_no),
  KEY idx_users_role_status (role, status),
  KEY idx_users_linked_council (linked_council_account_id),
  CONSTRAINT fk_users_linked_council FOREIGN KEY (linked_council_account_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE classes (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_year_id      BIGINT UNSIGNED NOT NULL,
  grade               TINYINT UNSIGNED NOT NULL,
  class_no            TINYINT UNSIGNED NOT NULL,
  name                VARCHAR(10) NOT NULL,
  homeroom_teacher_id BIGINT UNSIGNED NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_classes_year_grade_no (school_year_id, grade, class_no),
  KEY idx_classes_homeroom (homeroom_teacher_id),
  CONSTRAINT chk_classes_grade CHECK (grade BETWEEN 1 AND 6),
  CONSTRAINT fk_classes_school_year FOREIGN KEY (school_year_id) REFERENCES school_years (id),
  CONSTRAINT fk_classes_homeroom FOREIGN KEY (homeroom_teacher_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE users
  ADD CONSTRAINT fk_users_class FOREIGN KEY (class_id) REFERENCES classes (id);

CREATE TABLE teacher_classes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id   BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_teacher_classes (teacher_id, class_id),
  KEY idx_teacher_classes_class (class_id),
  CONSTRAINT fk_teacher_classes_teacher FOREIGN KEY (teacher_id) REFERENCES users (id),
  CONSTRAINT fk_teacher_classes_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 학생자치회 임원: "student+council" 판정의 단일 출처 (CNC-01)
CREATE TABLE council_members (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  title      VARCHAR(20) NOT NULL,
  term_start DATE NOT NULL,
  term_end   DATE NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_council_members_user (user_id, is_active),
  CONSTRAINT fk_council_members_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================
-- 게시글 (리포트·일기·기사) — 상태 전이는 PostService.transition() 한 곳 (RPT-06)
-- =========================================================
CREATE TABLE posts (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type                 ENUM('report','diary','article') NOT NULL,
  author_id            BIGINT UNSIGNED NOT NULL,
  -- 작성 시점 스냅샷: 반·학년 (익명 검토 큐가 users 조인 없이 본인·같은 반 제외, APR-02)
  class_id             BIGINT UNSIGNED NOT NULL,
  grade                TINYINT UNSIGNED NOT NULL,
  status               ENUM('draft','pending','reviewed','flagged','approved','rejected','hidden') NOT NULL DEFAULT 'draft',
  visibility           ENUM('class','school') NOT NULL DEFAULT 'class',
  title                VARCHAR(80) NULL,
  body                 TEXT NOT NULL,
  goal_text            VARCHAR(100) NULL,
  week_key             CHAR(8) NULL,
  -- 리포트·일기 합쳐 주 1건 (RPT-01): 부분 유니크를 생성 컬럼으로 대체
  report_week_key      CHAR(8) GENERATED ALWAYS AS (IF(type IN ('report','diary'), week_key, NULL)) STORED,
  submitted_at         DATETIME(3) NULL,
  -- 1차 검토(자치회 임원 / 교사 검토 계정)
  council_reviewer_id  BIGINT UNSIGNED NULL,
  council_reviewed_at  DATETIME(3) NULL,
  council_result       ENUM('pass','hold') NULL,
  council_checklist    JSON NULL,
  council_note         VARCHAR(500) NULL,
  -- 2차 승인(교사)
  reviewed_by          BIGINT UNSIGNED NULL,
  reviewed_at          DATETIME(3) NULL,
  reject_reason        VARCHAR(200) NULL,
  approved_at          DATETIME(3) NULL,
  hidden_reason        VARCHAR(200) NULL,
  -- 캐시 컬럼: 매일 03:00 배치로 재검증 (8.1)
  like_count           INT NOT NULL DEFAULT 0,
  comment_count        INT NOT NULL DEFAULT 0,
  -- 소프트 삭제: 원장 ref 보존
  deleted_at           DATETIME(3) NULL,
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_posts_author_report_week (author_id, report_week_key),
  KEY idx_posts_status_class_submitted (status, class_id, submitted_at),
  KEY idx_posts_type_status_approved (type, status, approved_at),
  KEY idx_posts_author_type_created (author_id, type, created_at),
  KEY idx_posts_status_grade_submitted (status, grade, submitted_at),
  KEY idx_posts_council_reviewer (council_reviewer_id),
  KEY idx_posts_reviewed_by (reviewed_by),
  CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users (id),
  CONSTRAINT fk_posts_class FOREIGN KEY (class_id) REFERENCES classes (id),
  CONSTRAINT fk_posts_council_reviewer FOREIGN KEY (council_reviewer_id) REFERENCES users (id),
  CONSTRAINT fk_posts_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE report_details (
  post_id             BIGINT UNSIGNED NOT NULL,
  avg_minutes_per_day SMALLINT UNSIGNED NULL,
  top_category        VARCHAR(30) NULL,
  top_app             VARCHAR(50) NULL,
  -- 지난주 스냅샷·차이 (RPT-08)
  prev_avg_minutes    SMALLINT UNSIGNED NULL,
  diff_minutes        SMALLINT NULL,
  -- 지난주 목표 달성 체크 (RPT-03)
  goal_achieved       TINYINT(1) NULL,
  goal_reason         VARCHAR(200) NULL,
  -- 교사 성찰 평가 1~3 (7.2)
  teacher_score       TINYINT UNSIGNED NULL,
  PRIMARY KEY (post_id),
  CONSTRAINT chk_report_details_teacher_score CHECK (teacher_score IS NULL OR teacher_score BETWEEN 1 AND 3),
  CONSTRAINT fk_report_details_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE article_details (
  post_id      BIGINT UNSIGNED NOT NULL,
  article_type ENUM('coverage','interview','review','cardnews') NOT NULL,
  tags         JSON NOT NULL,
  one_line     VARCHAR(100) NULL,
  is_featured  TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id),
  CONSTRAINT fk_article_details_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 리사이즈본(긴 변 1280px, EXIF 제거)만 저장. 원본 미보관 (RPT-04)
CREATE TABLE post_images (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id      BIGINT UNSIGNED NOT NULL,
  kind         ENUM('category_capture','app_capture','photo') NOT NULL,
  path         VARCHAR(255) NOT NULL,
  width        SMALLINT UNSIGNED NOT NULL,
  height       SMALLINT UNSIGNED NOT NULL,
  sort         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- 동의 철회 시 30일 뒤 삭제 대기 (AUTH-09)
  delete_after DATE NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_post_images_post_sort (post_id, sort),
  KEY idx_post_images_delete_after (delete_after),
  CONSTRAINT fk_post_images_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================
-- 반응: 댓글·좋아요·신고 — target_type/target_id 로 일반화 (8.1, 2·3차 확장)
-- =========================================================
CREATE TABLE comments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_type   VARCHAR(20) NOT NULL,
  target_id     BIGINT UNSIGNED NOT NULL,
  author_id     BIGINT UNSIGNED NOT NULL,
  body          VARCHAR(300) NOT NULL,
  status        ENUM('visible','hidden') NOT NULL DEFAULT 'visible',
  hidden_by     BIGINT UNSIGNED NULL,
  hidden_reason VARCHAR(100) NULL,
  like_count    INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_comments_target (target_type, target_id, created_at),
  KEY idx_comments_author_created (author_id, created_at),
  KEY idx_comments_status_created (status, created_at),
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users (id),
  CONSTRAINT fk_comments_hidden_by FOREIGN KEY (hidden_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE likes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  target_id   BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_likes_user_target (user_id, target_type, target_id),
  KEY idx_likes_target (target_type, target_id),
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 신고 (RCT-05): 3명 누적 시 자동 숨김
CREATE TABLE reports (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  target_id   BIGINT UNSIGNED NOT NULL,
  reason      VARCHAR(200) NOT NULL,
  status      ENUM('open','kept','hidden','deleted') NOT NULL DEFAULT 'open',
  handled_by  BIGINT UNSIGNED NULL,
  handled_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_reports_reporter_target (reporter_id, target_type, target_id),
  KEY idx_reports_target_status (target_type, target_id, status),
  KEY idx_reports_status_created (status, created_at),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id),
  CONSTRAINT fk_reports_handled_by FOREIGN KEY (handled_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE banned_words (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  word       VARCHAR(50) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_banned_words_word (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================
-- 포인트: 규칙표 + 원장 (PT-01~03, 7.1, 7.5) — 합계 컬럼 없음, 원장 집계로 판단
-- =========================================================
CREATE TABLE point_rules (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(40) NOT NULL,
  name        VARCHAR(60) NOT NULL,
  amount      INT NOT NULL,
  amount_min  INT NULL,
  amount_max  INT NULL,
  -- [{scope: day|week|month|per_object|streak, unit: count|points, max, share_codes?, by?}]
  caps        JSON NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  version     INT NOT NULL DEFAULT 1,
  description VARCHAR(200) NULL,
  sort        SMALLINT NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_point_rules_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 규칙 변경 이력: 리빌드(PT-08) 때 그 시점 규칙 복원
CREATE TABLE point_rule_history (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_code  VARCHAR(40) NOT NULL,
  version    INT NOT NULL,
  snapshot   JSON NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_point_rule_history (rule_code, version),
  CONSTRAINT fk_point_rule_history_changed_by FOREIGN KEY (changed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE point_ledger (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  rule_code    VARCHAR(40) NOT NULL,
  rule_version INT NOT NULL DEFAULT 1,
  -- 회수 행은 같은 rule_code 로 음수 (PT-03)
  amount       INT NOT NULL,
  ref_type     VARCHAR(20) NULL,
  ref_id       BIGINT UNSIGNED NULL,
  day_key      CHAR(10) NOT NULL,
  week_key     CHAR(8) NOT NULL,
  month_key    CHAR(7) GENERATED ALWAYS AS (LEFT(day_key, 7)) STORED,
  note         VARCHAR(200) NULL,
  granted_by   BIGINT UNSIGNED NULL,
  reversal_of  BIGINT UNSIGNED NULL,
  -- 멱등 키: 같은 이벤트 이중 지급 방지
  event_key    VARCHAR(80) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_point_ledger_event_key (event_key),
  UNIQUE KEY uq_point_ledger_reversal_of (reversal_of),
  KEY idx_point_ledger_user_week (user_id, week_key),
  KEY idx_point_ledger_ref (ref_type, ref_id),
  KEY idx_point_ledger_rule_day (rule_code, day_key),
  KEY idx_point_ledger_user_rule_day (user_id, rule_code, day_key),
  KEY idx_point_ledger_user_month (user_id, month_key),
  KEY idx_point_ledger_granted_by_week (granted_by, week_key),
  CONSTRAINT chk_point_ledger_amount CHECK (amount <> 0),
  CONSTRAINT fk_point_ledger_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_point_ledger_granted_by FOREIGN KEY (granted_by) REFERENCES users (id),
  CONSTRAINT fk_point_ledger_reversal_of FOREIGN KEY (reversal_of) REFERENCES point_ledger (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================
-- 출석·읽기 (PT-09, PT-10)
-- =========================================================
CREATE TABLE login_days (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  day_key       CHAR(10) NOT NULL,
  first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_login_days_user_day (user_id, day_key),
  CONSTRAINT fk_login_days_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE post_reads (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  target_type  VARCHAR(20) NOT NULL,
  target_id    BIGINT UNSIGNED NOT NULL,
  opened_at    DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_post_reads_user_target (user_id, target_type, target_id),
  KEY idx_post_reads_user_completed (user_id, completed_at),
  CONSTRAINT fk_post_reads_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================
-- 결산 스냅샷 (HOF-01, 02, 02a, 02b, 02c, 03, 04) — 확정 후 불변
-- =========================================================
CREATE TABLE weekly_scores (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  week_key      CHAR(8) NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  grade         TINYINT UNSIGNED NOT NULL,
  class_id      BIGINT UNSIGNED NOT NULL,
  points        INT NOT NULL,
  rank_in_grade SMALLINT UNSIGNED NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_weekly_scores_week_user (week_key, user_id),
  KEY idx_weekly_scores_week_grade_rank (week_key, grade, rank_in_grade),
  CONSTRAINT fk_weekly_scores_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_weekly_scores_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE weekly_class_scores (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  week_key           CHAR(8) NOT NULL,
  class_id           BIGINT UNSIGNED NOT NULL,
  grade              TINYINT UNSIGNED NOT NULL,
  member_count       SMALLINT UNSIGNED NOT NULL,
  avg_points         DECIMAL(8,2) NOT NULL,
  participation_rate DECIMAL(5,2) NOT NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_weekly_class_scores (week_key, class_id),
  CONSTRAINT fk_weekly_class_scores_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE monthly_settlements (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  month_key              CHAR(7) NOT NULL,
  status                 ENUM('draft','confirmed') NOT NULL DEFAULT 'draft',
  -- 지난달 결산: 연속 선정 제한(HOF-02c) 판단
  prev_settlement_id     BIGINT UNSIGNED NULL,
  per_grade_gift_count   TINYINT UNSIGNED NOT NULL DEFAULT 5,
  per_grade_growth_count TINYINT UNSIGNED NOT NULL DEFAULT 3,
  winner_class_id        BIGINT UNSIGNED NULL,
  exclude_weekly_gift    TINYINT(1) NOT NULL DEFAULT 0,
  drafted_at             DATETIME(3) NULL,
  confirmed_by           BIGINT UNSIGNED NULL,
  confirmed_at           DATETIME(3) NULL,
  note                   VARCHAR(500) NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_monthly_settlements_month (month_key),
  CONSTRAINT fk_monthly_settlements_prev FOREIGN KEY (prev_settlement_id) REFERENCES monthly_settlements (id),
  CONSTRAINT fk_monthly_settlements_winner_class FOREIGN KEY (winner_class_id) REFERENCES classes (id),
  CONSTRAINT fk_monthly_settlements_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE monthly_scores (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  settlement_id    BIGINT UNSIGNED NOT NULL,
  user_id          BIGINT UNSIGNED NOT NULL,
  grade            TINYINT UNSIGNED NOT NULL,
  class_id         BIGINT UNSIGNED NOT NULL,
  points           INT NOT NULL,
  prev_points      INT NULL,
  growth_rate      DECIMAL(7,3) NULL,
  rank_in_grade    SMALLINT UNSIGNED NOT NULL,
  is_gift_target   TINYINT(1) NOT NULL DEFAULT 0,
  is_growth_target TINYINT(1) NOT NULL DEFAULT 0,
  skipped_reason   VARCHAR(100) NULL,
  -- 동점 처리 근거 (HOF-03): {reportCount, articleCount, activeDays}
  tiebreak         JSON NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_monthly_scores_settlement_user (settlement_id, user_id),
  KEY idx_monthly_scores_grade_rank (settlement_id, grade, rank_in_grade),
  CONSTRAINT fk_monthly_scores_settlement FOREIGN KEY (settlement_id) REFERENCES monthly_settlements (id) ON DELETE CASCADE,
  CONSTRAINT fk_monthly_scores_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_monthly_scores_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE monthly_class_scores (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  settlement_id      BIGINT UNSIGNED NOT NULL,
  class_id           BIGINT UNSIGNED NOT NULL,
  grade              TINYINT UNSIGNED NOT NULL,
  -- 재적 인원(미동의 학생 제외)
  member_count       SMALLINT UNSIGNED NOT NULL,
  avg_points         DECIMAL(8,2) NOT NULL,
  participation_rate DECIMAL(5,2) NOT NULL,
  rank_overall       SMALLINT UNSIGNED NOT NULL,
  is_winner          TINYINT(1) NOT NULL DEFAULT 0,
  skipped_reason     VARCHAR(100) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_monthly_class_scores (settlement_id, class_id),
  CONSTRAINT fk_monthly_class_scores_settlement FOREIGN KEY (settlement_id) REFERENCES monthly_settlements (id) ON DELETE CASCADE,
  CONSTRAINT fk_monthly_class_scores_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE monthly_awards (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  month_key       CHAR(7) NOT NULL,
  category        ENUM('phonefree','reporter','participation','growth') NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  grade           TINYINT UNSIGNED NOT NULL,
  score           DECIMAL(8,2) NOT NULL,
  score_breakdown JSON NULL,
  rank_in_grade   SMALLINT UNSIGNED NOT NULL,
  status          ENUM('candidate','selected','skipped') NOT NULL DEFAULT 'candidate',
  skipped_reason  VARCHAR(100) NULL,
  reason          VARCHAR(200) NULL,
  confirmed_by    BIGINT UNSIGNED NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_monthly_awards_month_category_user (month_key, category, user_id),
  KEY idx_monthly_awards_month_category_status (month_key, category, status),
  CONSTRAINT fk_monthly_awards_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_monthly_awards_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================
-- 승인 워크플로 설정·검토 담당·이력 (APR-01, 02a, 08, 12)
-- =========================================================
CREATE TABLE approval_settings (
  id                           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope                        ENUM('school','grade','class') NOT NULL,
  scope_id                     INT UNSIGNED NULL,
  mode                         ENUM('two_step','teacher_only') NOT NULL DEFAULT 'two_step',
  auto_escalate_hours          SMALLINT UNSIGNED NOT NULL DEFAULT 48,
  -- APR-14 교사 검토 계정 통과 시 자동 2차 승인 (기본 꺼짐)
  auto_approve_teacher_review  TINYINT(1) NOT NULL DEFAULT 0,
  updated_by                   BIGINT UNSIGNED NULL,
  created_at                   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_approval_settings_scope (scope, scope_id),
  CONSTRAINT fk_approval_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE review_assignments (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reviewer_user_id BIGINT UNSIGNED NOT NULL,
  reviewer_kind    ENUM('student','teacher') NOT NULL,
  grades           JSON NOT NULL,
  post_types       JSON NOT NULL,
  allowed_results  ENUM('pass_only','pass_hold') NOT NULL DEFAULT 'pass_hold',
  daily_cap        SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  preset           ENUM('assist','basic','senior','custom') NOT NULL DEFAULT 'basic',
  starts_at        DATE NOT NULL,
  ends_at          DATE NULL,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  set_by           BIGINT UNSIGNED NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_review_assignments_reviewer (reviewer_user_id, is_active),
  CONSTRAINT fk_review_assignments_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users (id),
  CONSTRAINT fk_review_assignments_set_by FOREIGN KEY (set_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 검토·승인 이력 (APR-08). 설정 변경 로그(assignment_change)는 post_id NULL
CREATE TABLE review_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id    BIGINT UNSIGNED NULL,
  actor_id   BIGINT UNSIGNED NOT NULL,
  actor_role ENUM('council','council_teacher','teacher','admin','system') NOT NULL,
  action     ENUM('pass','hold','approve','reject','hide','unhide','reset','auto_escalate','assignment_change') NOT NULL,
  checklist  JSON NULL,
  note       VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_review_logs_post_created (post_id, created_at),
  KEY idx_review_logs_actor_created (actor_id, created_at),
  CONSTRAINT fk_review_logs_post FOREIGN KEY (post_id) REFERENCES posts (id),
  CONSTRAINT fk_review_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 댓글 모아보기 확인 이력 (TCH-07)
CREATE TABLE comment_review_checks (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id BIGINT UNSIGNED NOT NULL,
  scope      ENUM('class','grade','group') NOT NULL,
  scope_id   VARCHAR(10) NOT NULL,
  checked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_comment_review_checks_scope (scope, scope_id, checked_at),
  KEY idx_comment_review_checks_teacher (teacher_id, checked_at),
  CONSTRAINT fk_comment_review_checks_teacher FOREIGN KEY (teacher_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================
-- 알림·설정·공지
-- =========================================================
CREATE TABLE notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  type       VARCHAR(40) NOT NULL,
  payload    JSON NOT NULL,
  read_at    DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notifications_user_read_created (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE settings (
  `key`      VARCHAR(60) NOT NULL,
  value      JSON NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`),
  CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notices (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title      VARCHAR(100) NOT NULL,
  body       TEXT NOT NULL,
  starts_at  DATETIME(3) NOT NULL,
  ends_at    DATETIME(3) NOT NULL,
  author_id  BIGINT UNSIGNED NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notices_active_period (is_active, starts_at, ends_at),
  CONSTRAINT fk_notices_author FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
