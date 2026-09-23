-- 005_points_review.sql — 원장 상한 객체 + 자동 승격 표시 (PT-02 per_object 상한, APR-07)
-- object_type/object_id: per_object 상한의 대상(예: LIKE_RECEIVED_POST 는 ref=like 행이지만 상한 객체는 post).
-- 기본은 ref 와 같다. 회수 행도 같은 객체를 가리켜 net 집계가 맞는다.
ALTER TABLE point_ledger
  ADD COLUMN object_type VARCHAR(20) NULL AFTER ref_id,
  ADD COLUMN object_id BIGINT UNSIGNED NULL AFTER object_type,
  ADD KEY idx_point_ledger_user_rule_object (user_id, rule_code, object_type, object_id);

-- 48시간 미검토 승격 표시를 1회만 기록 (APR-07)
ALTER TABLE posts ADD COLUMN escalated_at DATETIME(3) NULL AFTER approved_at;
