/**
 * 검토 관련 표시 문구 (서버 lib/reviewRules 의 코드와 짝). 코드로 저장, 문구는 여기서 붙인다.
 */
export const CHECKLIST_LABEL: Record<string, string> = {
  captures_match: '캡처 2장이 사용시간·앱 순위 화면이 맞아요',
  body_length: '성찰 글이 100자 이상이에요',
  goal_present: '다음 주 목표가 한 줄 있어요',
  clean: '나쁜 말·개인정보가 없어요',
  title_tags_body: '제목·영역·본문(200자)이 있어요',
  photos_ok: '사진이 기사와 관련 있고 개인정보가 없어요',
};

export const REVIEW_ACTION_LABEL: Record<string, string> = {
  pass: '1차 통과',
  hold: '보류 요청',
  approve: '승인',
  reject: '반려',
  hide: '숨김',
  unhide: '숨김 해제',
  reset: '초기화',
  auto_escalate: '기준 시간 지나 교사에게 넘김',
  assignment_change: '검토 담당 변경',
};

export const ACTOR_ROLE_LABEL: Record<string, string> = {
  council: '자치회 임원',
  council_teacher: '교사 검토 계정',
  teacher: '교사',
  admin: '관리자',
  system: '시스템',
};

export const POST_TYPE_LABEL: Record<string, string> = {
  report: '리포트',
  diary: '일기',
  article: '기사',
};

export const HOLD_NOTE_MIN = 20;
