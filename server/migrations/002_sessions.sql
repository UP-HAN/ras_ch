-- 002_sessions.sql — express-session 저장소 (server/src/middleware/MySqlSessionStore.ts)
-- expires 는 UNIX 초. 만료 행은 스토어가 1시간마다 정리한다.
CREATE TABLE sessions (
  session_id VARCHAR(128) NOT NULL,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT NOT NULL,
  PRIMARY KEY (session_id),
  KEY idx_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
