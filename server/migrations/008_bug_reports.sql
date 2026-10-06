-- 버그 신고 게시판 (BUG-01~05)
-- 학생·교사 모두 신고하고, 본인 글과 관리자 답변만 본다(2026-10-06 사용자 결정).
-- 캡처는 1장만, 경로만 저장한다(절대 규칙 8: 원본 미보관, 리사이즈본만).

CREATE TABLE bug_reports (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id BIGINT UNSIGNED NOT NULL,
  title       VARCHAR(100) NOT NULL,
  body        TEXT NOT NULL,
  -- 신고 당시 화면 경로(앱 내부 경로만, 서버에서 다시 검사한다)
  page_path   VARCHAR(200) NULL,
  -- 캡처 1장의 uploads 상대 경로 (yyyy/mm/uuid.webp)
  image_path  VARCHAR(120) NULL,
  status      ENUM('received','checking','resolved','held') NOT NULL DEFAULT 'received',
  admin_reply TEXT NULL,
  replied_by  BIGINT UNSIGNED NULL,
  replied_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_bug_reports_image (image_path),
  KEY idx_bug_reports_reporter (reporter_id, created_at),
  KEY idx_bug_reports_status (status, created_at),
  CONSTRAINT fk_bug_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id),
  CONSTRAINT fk_bug_reports_replied_by FOREIGN KEY (replied_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
