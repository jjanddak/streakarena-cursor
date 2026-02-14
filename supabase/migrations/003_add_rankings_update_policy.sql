-- rankings 테이블: 신기록 갱신을 위해 UPDATE 정책 추가
-- (기존: SELECT, INSERT만 있어서 기존 행 UPDATE 시 RLS에 의해 거부됨)
CREATE POLICY "rankings_update" ON rankings FOR UPDATE USING (true);
