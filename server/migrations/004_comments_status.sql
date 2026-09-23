-- 004_comments_status.sql — 댓글 작성자 삭제(소프트) 지원 (RCT-02, 원장 참조 보존)
ALTER TABLE comments
  MODIFY COLUMN status ENUM('visible','hidden','deleted') NOT NULL DEFAULT 'visible',
  ADD COLUMN deleted_at DATETIME(3) NULL AFTER like_count;

-- 신고 3회 자동 숨김(RCT-05)은 시스템이 실행하므로 검토 이력의 actor 를 NULL 허용 (actor_role='system')
ALTER TABLE review_logs MODIFY COLUMN actor_id BIGINT UNSIGNED NULL;
