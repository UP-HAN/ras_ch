-- P2-2/P2-3: 학생자치회 게시판(CNC-01~08), 주간 선물(HOF-01a/01b), 게이미피케이션(PT-07 등급·칭호·학급 미션)

-- 자치회 글 (작성자 임원, 교사 승인 후 게시. 포인트 없음 CNC-06)
CREATE TABLE council_posts (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_id              BIGINT UNSIGNED NOT NULL,
  type                   ENUM('notice','promo','poll','report') NOT NULL,
  title                  VARCHAR(100) NOT NULL,
  body                   TEXT NOT NULL,
  status                 ENUM('draft','pending','approved','rejected','hidden','expired') NOT NULL DEFAULT 'draft',
  starts_at              DATETIME(3) NOT NULL,
  ends_at                DATETIME(3) NOT NULL,
  pin_requested          TINYINT(1) NOT NULL DEFAULT 0,
  is_pinned              TINYINT(1) NOT NULL DEFAULT 0,
  allow_comments         TINYINT(1) NOT NULL DEFAULT 1,
  poll_show_before_close TINYINT(1) NOT NULL DEFAULT 0,
  approved_by            BIGINT UNSIGNED NULL,
  approved_at            DATETIME(3) NULL,
  reject_reason          VARCHAR(200) NULL,
  submitted_at           DATETIME(3) NULL,
  like_count             INT NOT NULL DEFAULT 0,
  comment_count          INT NOT NULL DEFAULT 0,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_council_posts_status_period (status, starts_at, ends_at),
  KEY idx_council_posts_pinned (is_pinned, approved_at),
  CONSTRAINT fk_council_posts_author FOREIGN KEY (author_id) REFERENCES users (id),
  CONSTRAINT fk_council_posts_approved_by FOREIGN KEY (approved_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE council_post_images (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id    BIGINT UNSIGNED NOT NULL,
  path       VARCHAR(120) NOT NULL,
  width      SMALLINT UNSIGNED NOT NULL,
  height     SMALLINT UNSIGNED NOT NULL,
  sort       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_council_post_images_path (path),
  KEY idx_council_post_images_post (post_id, sort),
  CONSTRAINT fk_council_post_images_post FOREIGN KEY (post_id) REFERENCES council_posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE council_poll_options (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id    BIGINT UNSIGNED NOT NULL,
  label      VARCHAR(40) NOT NULL,
  sort       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  vote_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_council_poll_options_post (post_id, sort),
  CONSTRAINT fk_council_poll_options_post FOREIGN KEY (post_id) REFERENCES council_posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE council_poll_votes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id    BIGINT UNSIGNED NOT NULL,
  option_id  BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_council_poll_votes_post_user (post_id, user_id),
  KEY idx_council_poll_votes_option (option_id),
  CONSTRAINT fk_council_poll_votes_post FOREIGN KEY (post_id) REFERENCES council_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_council_poll_votes_option FOREIGN KEY (option_id) REFERENCES council_poll_options (id) ON DELETE CASCADE,
  CONSTRAINT fk_council_poll_votes_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 주간 선물 수시 지급 이력 (취소해도 행은 남긴다 HOF-01b)
CREATE TABLE weekly_gifts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  week_key     CHAR(8) NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  granted_by   BIGINT UNSIGNED NOT NULL,
  method       ENUM('top_n','manual') NOT NULL,
  status       ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  note         VARCHAR(200) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancelled_at DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_weekly_gifts_week_user (week_key, user_id),
  KEY idx_weekly_gifts_user (user_id, week_key),
  CONSTRAINT fk_weekly_gifts_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_weekly_gifts_granted_by FOREIGN KEY (granted_by) REFERENCES users (id),
  CONSTRAINT fk_weekly_gifts_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 칭호·업적 (정의는 코드 lib/achievements.ts)
CREATE TABLE user_achievements (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id   BIGINT UNSIGNED NOT NULL,
  code      VARCHAR(30) NOT NULL,
  earned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_achievements (user_id, code),
  CONSTRAINT fk_user_achievements_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 학급 미션 달성 기록 (주차별 1회)
CREATE TABLE class_mission_results (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id    BIGINT UNSIGNED NOT NULL,
  week_key    CHAR(8) NOT NULL,
  target_pct  TINYINT UNSIGNED NOT NULL,
  rate_pct    TINYINT UNSIGNED NOT NULL,
  achieved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_class_mission_results (class_id, week_key),
  CONSTRAINT fk_class_mission_results_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 대표 칭호 (획득한 것만, 서비스에서 검사)
ALTER TABLE users ADD COLUMN title_code VARCHAR(30) NULL AFTER tier;
