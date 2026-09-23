-- 003_audit_logs.sql — 관리자·담임 변경 API 감사 로그 (PRD 10장 보안)
-- payload 에는 학생 이름·비밀번호를 넣지 않는다(절대 규칙 8). id·필드명·변경 전후 값(민감 필드 제외)만.
CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    BIGINT UNSIGNED NULL,
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(30) NULL,
  target_id   BIGINT UNSIGNED NULL,
  payload     JSON NULL,
  ip          VARCHAR(45) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_logs_actor_created (actor_id, created_at),
  KEY idx_audit_logs_target (target_type, target_id),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
