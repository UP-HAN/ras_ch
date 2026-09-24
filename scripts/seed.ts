/**
 * 시범용 시드 (TASKS 0-3): `npm run db:seed` / `npm run db:seed -- --force`
 *  - 2026학년도, 3~6학년 각 1개 반, 교사 4명(admin·approver 1, grade_advisor 1), 학생 30명
 *  - 규칙표 7.1 전체, settings 기본값, approval_settings(two_step), 임원 2명 + 검토 담당, 금칙어, 공지
 *  - users 가 비어 있지 않으면 중단. --force 면 전 테이블 TRUNCATE 후 재시드. production 거부
 */
import bcrypt from 'bcryptjs';
import { env, isProd } from '../server/src/config/env.js';
import { closePool } from '../server/src/db/pool.js';
import { execute, insert, query, queryOne } from '../server/src/db/query.js';
import { assignDisplayNames } from '../server/src/lib/displayName.js';
import { buildStudentLoginId } from '../server/src/lib/studentId.js';
import type { PointCap } from '../server/src/types/db.js';

import bankSeed from '../docs/seed/topic-bank-seed.json' with { type: 'json' };

const FORCE = process.argv.includes('--force');
const SCHOOL_YEAR = 2026;
const STUDENT_PW = '1234';
const TEACHER_PW = 'teacher1234!';

// 시드 후 TRUNCATE 순서와 무관하게 지우기 위해 FK 검사를 잠시 끈다
const ALL_TABLES = [
  'news_best_opinions',
  'news_votes',
  'news_topics',
  'news_topic_bank',
  'audit_logs',
  // P2-2/P2-3 (007)
  'class_mission_results',
  'user_achievements',
  'weekly_gifts',
  'council_poll_votes',
  'council_poll_options',
  'council_post_images',
  'council_posts',
  'review_logs',
  'review_assignments',
  'approval_settings',
  'comment_review_checks',
  'monthly_awards',
  'monthly_class_scores',
  'monthly_scores',
  'monthly_settlements',
  'weekly_class_scores',
  'weekly_scores',
  'point_ledger',
  'point_rule_history',
  'point_rules',
  'post_reads',
  'login_days',
  'notifications',
  'notices',
  'banned_words',
  'reports',
  'likes',
  'comments',
  'post_images',
  'article_details',
  'report_details',
  'posts',
  'council_members',
  'teacher_classes',
  'sessions',
  'settings',
  'users',
  'classes',
  'school_years',
];

interface TeacherSeed {
  loginId: string;
  name: string;
  role: 'admin' | 'teacher';
  isApprover: boolean;
  advisorGradeGroup: '3-4' | '5-6' | null;
  /** 담임 반 (시범: 6학년 1~8반) */
  homeroomClassNo: number;
}

/** 시범 운영 범위(2026-09-24 결정): 6학년 1~8반만. 3~5학년은 전체 오픈 때 CSV 로 등록한다 */
export const PILOT_GRADE = 6;

const TEACHERS: TeacherSeed[] = [
  {
    loginId: 'admin@ches.es.kr',
    name: '한의표',
    role: 'admin',
    isApprover: true,
    advisorGradeGroup: null,
    homeroomClassNo: 1,
  },
  {
    loginId: 't2@ches.es.kr',
    name: '오세훈',
    role: 'teacher',
    isApprover: true, // 6학년 부장: 승인 권한 교사 그룹(PLAN 4장)
    advisorGradeGroup: null,
    homeroomClassNo: 2,
  },
  {
    loginId: 't3@ches.es.kr',
    name: '윤진경',
    role: 'teacher',
    isApprover: false,
    advisorGradeGroup: null,
    homeroomClassNo: 3,
  },
  {
    loginId: 't4@ches.es.kr',
    name: '박용휘',
    role: 'teacher',
    isApprover: false,
    advisorGradeGroup: null,
    homeroomClassNo: 4,
  },
  {
    loginId: 't5@ches.es.kr',
    name: '김서현',
    role: 'teacher',
    isApprover: false,
    advisorGradeGroup: null,
    homeroomClassNo: 5,
  },
  {
    loginId: 't6@ches.es.kr',
    name: '정수민',
    role: 'teacher',
    isApprover: false,
    advisorGradeGroup: null,
    homeroomClassNo: 6,
  },
  {
    loginId: 't7@ches.es.kr',
    name: '최은영',
    role: 'teacher',
    isApprover: false,
    advisorGradeGroup: null,
    homeroomClassNo: 7,
  },
  {
    loginId: 't8@ches.es.kr',
    name: '강태우',
    role: 'teacher',
    isApprover: false,
    advisorGradeGroup: null,
    homeroomClassNo: 8,
  },
];

interface StudentSeed {
  classNo: number;
  no: number;
  name: string;
  consent: 'Y' | 'N';
  reporter?: boolean;
  council?: string; // 직책
}

// 6학년 1~8반, 반당 7~8명. 의도적 케이스: 같은 반 마스킹 중복(6-3 김하늘·김보늘 → 김○늘(1)/김○늘(6)), 2글자(강민), 4글자(남궁민수)
// 임원(6학년): 6-1 회장, 6-2 부회장, 6-5 서기
const STUDENTS: StudentSeed[] = [
  { classNo: 1, no: 1, name: '류다은', consent: 'Y', council: '회장' },
  { classNo: 1, no: 2, name: '김민재', consent: 'Y' },
  { classNo: 1, no: 3, name: '이수빈', consent: 'N' },
  { classNo: 1, no: 4, name: '박서연', consent: 'Y', reporter: true },
  { classNo: 1, no: 5, name: '정우진', consent: 'Y' },
  { classNo: 1, no: 6, name: '최하린', consent: 'Y' },
  { classNo: 1, no: 7, name: '한도윤', consent: 'Y' },
  { classNo: 2, no: 1, name: '황민준', consent: 'Y', council: '부회장' },
  { classNo: 2, no: 2, name: '오지아', consent: 'Y' },
  { classNo: 2, no: 3, name: '서준호', consent: 'Y' },
  { classNo: 2, no: 4, name: '윤아름', consent: 'N' },
  { classNo: 2, no: 5, name: '장시우', consent: 'Y' },
  { classNo: 2, no: 6, name: '임채원', consent: 'Y' },
  { classNo: 2, no: 7, name: '고은채', consent: 'Y' },
  { classNo: 3, no: 1, name: '김하늘', consent: 'Y' },
  { classNo: 3, no: 2, name: '이서준', consent: 'Y' },
  { classNo: 3, no: 3, name: '박지우', consent: 'N' },
  { classNo: 3, no: 4, name: '최도윤', consent: 'Y' },
  { classNo: 3, no: 5, name: '정하윤', consent: 'Y' },
  { classNo: 3, no: 6, name: '김보늘', consent: 'Y' },
  { classNo: 3, no: 7, name: '강민', consent: 'N' },
  { classNo: 3, no: 8, name: '남궁민수', consent: 'Y' },
  { classNo: 4, no: 1, name: '윤서아', consent: 'Y' },
  { classNo: 4, no: 2, name: '장예준', consent: 'Y', reporter: true },
  { classNo: 4, no: 3, name: '오시우', consent: 'N' },
  { classNo: 4, no: 4, name: '한지호', consent: 'Y' },
  { classNo: 4, no: 5, name: '서유나', consent: 'Y' },
  { classNo: 4, no: 6, name: '신은우', consent: 'Y' },
  { classNo: 4, no: 7, name: '문채원', consent: 'N' },
  { classNo: 4, no: 8, name: '배준서', consent: 'Y' },
  { classNo: 5, no: 1, name: '조수아', consent: 'Y', council: '서기' },
  { classNo: 5, no: 2, name: '임건우', consent: 'Y' },
  { classNo: 5, no: 3, name: '홍지안', consent: 'N' },
  { classNo: 5, no: 4, name: '권나연', consent: 'Y' },
  { classNo: 5, no: 5, name: '송현우', consent: 'Y' },
  { classNo: 5, no: 6, name: '안서윤', consent: 'Y' },
  { classNo: 5, no: 7, name: '나예은', consent: 'Y' },
  { classNo: 6, no: 1, name: '전지민', consent: 'Y', reporter: true },
  { classNo: 6, no: 2, name: '백승현', consent: 'Y' },
  { classNo: 6, no: 3, name: '노아린', consent: 'N' },
  { classNo: 6, no: 4, name: '유하준', consent: 'Y' },
  { classNo: 6, no: 5, name: '표소율', consent: 'Y' },
  { classNo: 6, no: 6, name: '심재이', consent: 'N' },
  { classNo: 6, no: 7, name: '구본우', consent: 'Y' },
  { classNo: 7, no: 1, name: '문서현', consent: 'Y' },
  { classNo: 7, no: 2, name: '양지훈', consent: 'Y', reporter: true },
  { classNo: 7, no: 3, name: '손예린', consent: 'Y' },
  { classNo: 7, no: 4, name: '배현우', consent: 'N' },
  { classNo: 7, no: 5, name: '차수아', consent: 'Y' },
  { classNo: 7, no: 6, name: '엄태양', consent: 'Y' },
  { classNo: 7, no: 7, name: '허윤서', consent: 'Y' },
  { classNo: 8, no: 1, name: '남지호', consent: 'Y' },
  { classNo: 8, no: 2, name: '진서우', consent: 'Y' },
  { classNo: 8, no: 3, name: '위다인', consent: 'N' },
  { classNo: 8, no: 4, name: '변준영', consent: 'Y' },
  { classNo: 8, no: 5, name: '탁소민', consent: 'Y' },
  { classNo: 8, no: 6, name: '석하람', consent: 'Y' },
  { classNo: 8, no: 7, name: '피지원', consent: 'Y' },
];

interface RuleSeed {
  code: string;
  name: string;
  amount: number;
  min?: number;
  max?: number;
  caps: PointCap[];
  description: string;
}

// PRD 7.1 기본 규칙표 전체. 2·3차 규칙도 넣어 두되 트리거 코드가 없을 뿐이다.
const RULES: RuleSeed[] = [
  {
    code: 'REPORT_APPROVED',
    name: '리포트 승인',
    amount: 30,
    caps: [{ scope: 'week', unit: 'count', max: 1 }],
    description: '주 1회',
  },
  {
    code: 'REPORT_DECREASE',
    name: '사용시간 감소 보너스',
    amount: 10,
    caps: [{ scope: 'week', unit: 'count', max: 1 }],
    description: '리포트 승인 시 지난주 대비 감소, 주 1회',
  },
  {
    code: 'GOAL_CHECKED',
    name: '목표 달성 체크',
    amount: 5,
    caps: [{ scope: 'week', unit: 'count', max: 1 }],
    description: '지난주 목표 달성 체크 + 이유, 주 1회',
  },
  {
    code: 'ARTICLE_APPROVED',
    name: '기사 승인',
    amount: 30,
    caps: [{ scope: 'month', unit: 'count', max: 4 }],
    description: '월 4회',
  },
  {
    code: 'REPORTER_BONUS',
    name: '기자단 가산',
    amount: 10,
    caps: [{ scope: 'month', unit: 'count', max: 4 }],
    description: '기자단 배지 학생 기사 승인 시, ARTICLE_APPROVED와 동일 상한',
  },
  {
    code: 'COMMENT_WRITTEN',
    name: '댓글 작성',
    amount: 3,
    caps: [
      { scope: 'day', unit: 'count', max: 5, share_codes: ['NEWS_OPINION', 'AGENDA_OPINION'] },
    ],
    description: '10자 이상, 타인 글, 일 5회(토론·안건 의견과 합산)',
  },
  {
    code: 'LIKE_GIVEN',
    name: '좋아요 누름',
    amount: 1,
    caps: [{ scope: 'day', unit: 'count', max: 10 }],
    description: '타인 글, 일 10회',
  },
  {
    code: 'LIKE_RECEIVED_POST',
    name: '내 게시글이 좋아요 받음',
    amount: 1,
    caps: [{ scope: 'per_object', unit: 'points', max: 20 }],
    description: '게시글당 20',
  },
  {
    code: 'LIKE_RECEIVED_COMMENT',
    name: '내 댓글이 좋아요 받음',
    amount: 1,
    caps: [{ scope: 'per_object', unit: 'points', max: 5 }],
    description: '댓글당 5',
  },
  {
    code: 'DAILY_LOGIN',
    name: '출석',
    amount: 2,
    caps: [{ scope: 'day', unit: 'count', max: 1 }],
    description: '하루 첫 접속, 일 1회',
  },
  {
    code: 'STREAK_7',
    name: '7일 연속 출석',
    amount: 10,
    caps: [{ scope: 'per_object', unit: 'count', max: 1 }],
    description: '7일마다 1회(연속 구간을 근거 객체로)',
  },
  {
    code: 'POST_READ',
    name: '타인 글 읽기',
    amount: 1,
    caps: [
      { scope: 'per_object', unit: 'count', max: 1 },
      { scope: 'day', unit: 'count', max: 5 },
    ],
    description: '10초 이상 + 끝까지 스크롤, 글당 1회, 일 5회',
  },
  {
    code: 'REVIEW_DONE',
    name: '1차 검토 완료',
    amount: 1,
    caps: [{ scope: 'day', unit: 'count', max: 10 }],
    description: '자치회 임원 검토 1건당, 일 10회(교사 검토 계정 미지급)',
  },
  {
    code: 'SURVEY_ANSWERED',
    name: '설문 제출',
    amount: 10,
    min: 5,
    max: 20,
    caps: [{ scope: 'per_object', unit: 'count', max: 1 }],
    description: '설문당 1회, 작성자가 5~20 지정 (3차)',
  },
  {
    code: 'AGENDA_OPINION',
    name: '안건 의견 작성',
    amount: 3,
    caps: [
      { scope: 'day', unit: 'count', max: 5, share_codes: ['COMMENT_WRITTEN', 'NEWS_OPINION'] },
    ],
    description: 'COMMENT_WRITTEN과 합산 일 5회 (3차)',
  },
  {
    code: 'PROPOSAL_ADOPTED',
    name: '안건 의견 채택',
    amount: 20,
    caps: [{ scope: 'per_object', unit: 'count', max: 1 }],
    description: '안건당 1회 (3차)',
  },
  {
    code: 'TEACHER_BONUS',
    name: '교사 칭찬 포인트',
    amount: 10,
    min: 5,
    max: 20,
    caps: [
      { scope: 'week', unit: 'points', max: 50 },
      { scope: 'week', unit: 'points', max: 300, by: 'granter' },
    ],
    description: '사유 필수, 학생당 주 50, 교사당 주 300',
  },
  {
    code: 'WEEKLY_GIFT',
    name: '주간 선물',
    amount: 20,
    caps: [{ scope: 'week', unit: 'count', max: 1 }],
    description: '관리자가 확정한 주만, 주 1회 (2차)',
  },
  {
    code: 'MONTHLY_TOP',
    name: '월간 포인트 상위 선정',
    amount: 50,
    caps: [{ scope: 'month', unit: 'count', max: 1 }],
    description: '선물 대상, 월 1회',
  },
  {
    code: 'GROWTH_AWARD',
    name: '월간 성장률 부문 선정',
    amount: 50,
    caps: [{ scope: 'month', unit: 'count', max: 1 }],
    description: '월 1회',
  },
  {
    code: 'MONTHLY_AWARD',
    name: '월간 명예의 전당 3부문 선정',
    amount: 100,
    caps: [{ scope: 'month', unit: 'count', max: 1 }],
    description: '월 1회',
  },
  {
    code: 'NEWS_VOTE',
    name: '토론 주제 투표',
    amount: 1,
    caps: [{ scope: 'per_object', unit: 'count', max: 1 }],
    description: '주제당 1회, 변경 시 재지급 없음 (2차)',
  },
  {
    code: 'NEWS_OPINION',
    name: '토론 의견 댓글',
    amount: 3,
    caps: [
      { scope: 'day', unit: 'count', max: 5, share_codes: ['COMMENT_WRITTEN', 'AGENDA_OPINION'] },
    ],
    description: 'COMMENT_WRITTEN과 합산 일 5회 (2차)',
  },
  {
    code: 'BEST_OPINION',
    name: '베스트 의견 선정',
    amount: 10,
    caps: [{ scope: 'per_object', unit: 'count', max: 1 }],
    description: '주제당 학년별 1~2명 (2차)',
  },
];

const SETTINGS: Record<string, unknown> = {
  tier_thresholds: { sprout: 200, flower: 500, fruit: 1000, star: 2000 },
  // P2-2/P2-3 게이미피케이션: 주간 선물 학년별 N, 학급 미션 목표 제출률
  gamify: { weeklyGiftPerGrade: 3, classMissionReportRate: 80 },
  allowed_grades: [3, 4, 5, 6],
  weekly_top_per_grade: 10,
  monthly_gift_per_grade: 5,
  monthly_growth_per_grade: 3,
  growth_min_prev_points: 30,
  review_grade_quota: { '3': 2, '4': 2, '5': 2, '6': 2 },
  review_daily_cap_default: 20,
  auto_escalate_hours: 48,
  teacher_bonus: { min: 5, max: 20, per_student_week: 50, per_teacher_week: 300 },
  report_text: { reflection_min: 100, reflection_max: 1000, goal_max: 100 },
  comment_rules: { min_len: 10, max_len: 300, per_post: 3 },
  capture_guide: {
    android_samsung:
      '설정 > 디지털 웰빙 및 자녀 보호 > 주간 리포트에서 "하루 평균 사용시간" 화면과 "많이 사용한 앱" 화면 두 장만 캡처해요.',
    iphone:
      '설정 > 스크린 타임 > 모든 활동 보기 > 주 에서 "일일 평균"과 "가장 많이 사용함" 화면을 캡처해요.',
    warning: '이름이나 프로필, 알림, 메시지, 사진이 보이는 화면은 캡처하지 마세요.',
  },
  good_comment_guide:
    '존댓말로 써요. 친구의 실천을 칭찬하거나, 궁금한 점을 묻거나, 응원하는 말을 10자 이상 써요. 놀리는 말은 안 돼요.',
  review_guide:
    '체크리스트 항목만 확인해요. 친구 글을 평가하는 게 아니에요. 판단이 어려우면 "보류 요청"을 눌러요.',
  // P2-1 토론방: 주당 1개(수요일 08:00)로 시작, 관리자가 2·3으로 올린다 (NWS-04, 사용자 결정 2026-09-24)
  news_schedule: { perWeek: 1, hour: 8, durationDays: 7, bestPerGrade: 2, commentsPerTopic: 3 },
};

const BANNED_WORDS = ['바보', '멍청이', '죽어', '꺼져', '찐따'];

async function assertSeedable(): Promise<void> {
  if (isProd) throw new Error('production 환경에서는 시드를 실행할 수 없습니다.');
  const row = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM users');
  if ((row?.n ?? 0) > 0 && !FORCE) {
    throw new Error(
      'users 테이블에 이미 데이터가 있습니다. 다시 시드하려면 `npm run db:seed -- --force` 를 쓰세요.',
    );
  }
}

async function truncateAll(): Promise<void> {
  await execute('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const t of ALL_TABLES) await execute(`TRUNCATE TABLE \`${t}\``);
  } finally {
    await execute('SET FOREIGN_KEY_CHECKS = 1');
  }
  console.log(`전체 테이블 비움 (${ALL_TABLES.length}개)`);
}

async function seed(): Promise<void> {
  await assertSeedable();
  if (FORCE) await truncateAll();

  const studentHash = await bcrypt.hash(STUDENT_PW, 10);
  const teacherHash = await bcrypt.hash(TEACHER_PW, 10);

  // 학년도
  const yearId = await insert(
    'INSERT INTO school_years (year, start_date, end_date, is_current) VALUES (?, ?, ?, 1)',
    [SCHOOL_YEAR, `${SCHOOL_YEAR}-03-01`, `${SCHOOL_YEAR + 1}-02-28`],
  );

  // 교사
  const teacherIds = new Map<string, number>();
  for (const t of TEACHERS) {
    const id = await insert(
      `INSERT INTO users (login_id, password_hash, role, is_approver, advisor_grade_group, name, display_name, must_change_pw)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [t.loginId, teacherHash, t.role, t.isApprover ? 1 : 0, t.advisorGradeGroup, t.name, t.name],
    );
    teacherIds.set(t.loginId, id);
  }

  // 반 (시범: 6학년 1~8반) + 담임 배정
  const classIdByNo = new Map<number, number>();
  for (const t of TEACHERS) {
    const teacherId = teacherIds.get(t.loginId) as number;
    const classId = await insert(
      'INSERT INTO classes (school_year_id, grade, class_no, name, homeroom_teacher_id) VALUES (?, ?, ?, ?, ?)',
      [yearId, PILOT_GRADE, t.homeroomClassNo, `${PILOT_GRADE}-${t.homeroomClassNo}`, teacherId],
    );
    classIdByNo.set(t.homeroomClassNo, classId);
    await insert('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)', [
      teacherId,
      classId,
    ]);
  }

  // 학생: display_name 은 반 단위로 중복을 검사해 생성 (3.1)
  const named = assignDisplayNames(
    STUDENTS.map((s) => ({
      ...s,
      classId: classIdByNo.get(s.classNo) as number,
      studentNo: s.no,
    })),
  );
  const studentIds = new Map<string, number>();
  for (const { item: s, displayName } of named) {
    const loginId = buildStudentLoginId(SCHOOL_YEAR, PILOT_GRADE, s.classNo, s.no);
    const id = await insert(
      `INSERT INTO users (login_id, password_hash, role, name, display_name, class_id, student_no,
                          parent_consent, consent_updated_at, is_reporter, must_change_pw)
       VALUES (?, ?, 'student', ?, ?, ?, ?, ?, NOW(3), ?, 1)`,
      [loginId, studentHash, s.name, displayName, s.classId, s.no, s.consent, s.reporter ? 1 : 0],
    );
    studentIds.set(loginId, id);
    if (s.council) {
      await insert(
        'INSERT INTO council_members (user_id, title, term_start, term_end, is_active) VALUES (?, ?, ?, ?, 1)',
        [id, s.council, `${SCHOOL_YEAR}-09-01`, `${SCHOOL_YEAR + 1}-02-28`],
      );
    }
  }

  // 검토 담당 (APR-02a): 임원 3명 모두 6학년 담당 (본인·같은 반 글은 시스템이 제외하므로 다른 반 글만 검토)
  const adminId = teacherIds.get('admin@ches.es.kr') as number;
  const assignments: Array<{ loginId: string; grades: number[] }> = STUDENTS.filter(
    (st) => st.council,
  ).map((st) => ({
    loginId: buildStudentLoginId(SCHOOL_YEAR, PILOT_GRADE, st.classNo, st.no),
    grades: [PILOT_GRADE],
  }));
  for (const a of assignments) {
    await insert(
      `INSERT INTO review_assignments (reviewer_user_id, reviewer_kind, grades, post_types, allowed_results, daily_cap, preset, starts_at, ends_at, is_active, set_by)
       VALUES (?, 'student', ?, ?, 'pass_hold', 20, 'basic', ?, ?, 1, ?)`,
      [
        studentIds.get(a.loginId),
        JSON.stringify(a.grades),
        JSON.stringify(['report', 'article']),
        `${SCHOOL_YEAR}-09-01`,
        `${SCHOOL_YEAR + 1}-02-28`,
        adminId,
      ],
    );
  }

  // 규칙표 (7.1)
  let sort = 0;
  for (const r of RULES) {
    sort += 10;
    await insert(
      `INSERT INTO point_rules (code, name, amount, amount_min, amount_max, caps, is_active, version, description, sort)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [
        r.code,
        r.name,
        r.amount,
        r.min ?? null,
        r.max ?? null,
        JSON.stringify(r.caps),
        r.description,
        sort,
      ],
    );
  }

  // 설정
  for (const [key, value] of Object.entries(SETTINGS)) {
    await insert('INSERT INTO settings (`key`, value, updated_by) VALUES (?, ?, ?)', [
      key,
      JSON.stringify(value),
      adminId,
    ]);
  }

  // 승인 모드: 학교 기본 two_step (APR-01)
  await insert(
    `INSERT INTO approval_settings (scope, scope_id, mode, auto_escalate_hours, auto_approve_teacher_review, updated_by)
     VALUES ('school', NULL, 'two_step', 48, 0, ?)`,
    [adminId],
  );

  for (const w of BANNED_WORDS) await insert('INSERT INTO banned_words (word) VALUES (?)', [w]);

  // 토론 주제 은행 30개: ready 5 / reserve 25 (NWS-05 확정)
  for (const t of bankSeed as Array<{
    id: number;
    type: string;
    title: string;
    body: string;
    questions: string[];
    tags: string[];
    status: string;
  }>) {
    await insert(
      `INSERT INTO news_topic_bank (title, body, type, questions, tags, status, reviewed_by, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.title,
        t.body,
        t.type,
        JSON.stringify(t.questions),
        JSON.stringify(t.tags),
        t.status === 'ready' ? 'ready' : 'reserve',
        adminId,
        t.id,
      ],
    );
  }

  await insert(
    `INSERT INTO notices (title, body, starts_at, ends_at, author_id, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      '초롱 RAS 포인트 시범 운영을 시작해요',
      '매주 일요일까지 폰프리 주간 리포트를 올려 보세요. 궁금한 점은 담임 선생님께 물어보세요.',
      `${SCHOOL_YEAR}-10-01 00:00:00`,
      `${SCHOOL_YEAR}-12-31 23:59:59`,
      adminId,
    ],
  );

  // 요약
  const counts = await query<{ t: string; n: number }>(
    `SELECT 'users' AS t, COUNT(*) AS n FROM users
     UNION ALL SELECT 'classes', COUNT(*) FROM classes
     UNION ALL SELECT 'point_rules', COUNT(*) FROM point_rules
     UNION ALL SELECT 'settings', COUNT(*) FROM settings
     UNION ALL SELECT 'council_members', COUNT(*) FROM council_members
     UNION ALL SELECT 'review_assignments', COUNT(*) FROM review_assignments
     UNION ALL SELECT 'news_topic_bank', COUNT(*) FROM news_topic_bank`,
  );
  console.log(`시드 완료 (${env.DB_NAME})`);
  for (const c of counts) console.log(`  ${c.t.padEnd(20)} ${c.n}`);
  const dup = await query<{ display_name: string; student_no: number }>(
    `SELECT display_name, student_no FROM users WHERE display_name LIKE '%(%' ORDER BY student_no`,
  );
  console.log(`  중복 마스킹 병기: ${dup.map((d) => d.display_name).join(', ') || '(없음)'}`);
  console.log(
    `  교사 초기 비밀번호: ${TEACHER_PW} / 학생 초기 비밀번호: ${STUDENT_PW} (첫 로그인 시 변경 강제)`,
  );
}

seed()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
