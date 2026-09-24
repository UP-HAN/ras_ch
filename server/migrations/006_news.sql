-- P2-1 주니어 뉴스 토론방 (NWS-01, 04~10, PRD 8.1)
--  news_topic_bank : 주제 은행 (pending 임원 제안 / reserve 대기 / ready 바로 사용 / used 사용됨)
--  news_topics     : 게시 주제 (scheduled 예약 / live 진행 / closed 마감 / rejected 취소; candidate·approved 는 3차 LLM 용)
--  news_votes      : 찬반 투표 (주제당 1인 1표, 변경 가능)
--  news_best_opinions : 베스트 의견 (댓글 1건당 1회, 학년별 상한은 서비스에서)
-- 댓글·좋아요·신고·읽기는 기존 comments/likes/reports/post_reads 의 target_type='news_topic' 으로 공유한다.

CREATE TABLE news_topic_bank (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title         VARCHAR(40) NOT NULL,
  body          VARCHAR(400) NOT NULL,
  type          ENUM('vote','open') NOT NULL,
  questions     JSON NOT NULL,
  tags          JSON NOT NULL,
  source_url    VARCHAR(300) NULL,
  proposed_by   BIGINT UNSIGNED NULL,
  reviewed_by   BIGINT UNSIGNED NULL,
  status        ENUM('pending','reserve','ready','used') NOT NULL DEFAULT 'reserve',
  used_topic_id BIGINT UNSIGNED NULL,
  sort          INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_news_bank_status_sort (status, sort, id),
  CONSTRAINT fk_news_bank_proposed_by FOREIGN KEY (proposed_by) REFERENCES users (id),
  CONSTRAINT fk_news_bank_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE news_topics (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title          VARCHAR(40) NOT NULL,
  body           VARCHAR(400) NOT NULL,
  type           ENUM('vote','open') NOT NULL,
  questions      JSON NOT NULL,
  tags           JSON NOT NULL,
  source_url     VARCHAR(300) NULL,
  source         ENUM('ai','bank','manual') NOT NULL DEFAULT 'manual',
  status         ENUM('candidate','approved','scheduled','live','closed','rejected') NOT NULL DEFAULT 'scheduled',
  publish_at     DATETIME(3) NULL,
  close_at       DATETIME(3) NULL,
  approved_by    BIGINT UNSIGNED NULL,
  bank_id        BIGINT UNSIGNED NULL,
  agree_count    INT NOT NULL DEFAULT 0,
  disagree_count INT NOT NULL DEFAULT 0,
  comment_count  INT NOT NULL DEFAULT 0,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_news_topics_status_publish (status, publish_at),
  KEY idx_news_topics_close (close_at),
  CONSTRAINT fk_news_topics_approved_by FOREIGN KEY (approved_by) REFERENCES users (id),
  CONSTRAINT fk_news_topics_bank FOREIGN KEY (bank_id) REFERENCES news_topic_bank (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE news_topic_bank
  ADD CONSTRAINT fk_news_bank_used_topic FOREIGN KEY (used_topic_id) REFERENCES news_topics (id);

CREATE TABLE news_votes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  topic_id   BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  side       ENUM('agree','disagree') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_votes_topic_user (topic_id, user_id),
  KEY idx_news_votes_user_created (user_id, created_at),
  CONSTRAINT fk_news_votes_topic FOREIGN KEY (topic_id) REFERENCES news_topics (id),
  CONSTRAINT fk_news_votes_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE news_best_opinions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  topic_id    BIGINT UNSIGNED NOT NULL,
  comment_id  BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  grade       TINYINT UNSIGNED NOT NULL,
  selected_by BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_best_comment (comment_id),
  KEY idx_news_best_topic_grade (topic_id, grade),
  KEY idx_news_best_user (user_id, created_at),
  CONSTRAINT fk_news_best_topic FOREIGN KEY (topic_id) REFERENCES news_topics (id),
  CONSTRAINT fk_news_best_comment FOREIGN KEY (comment_id) REFERENCES comments (id),
  CONSTRAINT fk_news_best_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_news_best_selected_by FOREIGN KEY (selected_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
