import { describe, expect, it } from 'vitest';
import type { PostRow } from '../../types/db.js';
import {
  findIdentifyingKeys,
  toReviewerPostView,
  toStudentPostView,
  toTeacherPostView,
  type PostBundle,
} from './post.js';

const now = new Date('2026-09-21T09:00:00+09:00');

const post: PostRow = {
  id: 10,
  type: 'report',
  author_id: 101,
  class_id: 3,
  grade: 5,
  status: 'pending',
  visibility: 'class',
  title: null,
  body: '이번 주 나는 유튜브를 가장 많이 썼다. 왜냐하면…',
  goal_text: '다음 주엔 30분 줄이기',
  week_key: '2026-W38',
  report_week_key: '2026-W38',
  submitted_at: now,
  council_reviewer_id: 202,
  council_reviewed_at: null,
  council_result: null,
  council_checklist: null,
  council_note: '캡처가 다른 화면이에요',
  reviewed_by: null,
  reviewed_at: null,
  reject_reason: null,
  approved_at: null,
  hidden_reason: null,
  like_count: 2,
  comment_count: 1,
  deleted_at: null,
  created_at: now,
  updated_at: now,
};

const bundle: PostBundle = {
  post,
  author: {
    id: 101,
    name: '김초롱',
    display_name: '김○롱',
    class_id: 3,
    student_no: 7,
    tier: 'sprout',
    title_code: null,
    is_reporter: 1,
    parent_consent: 'Y',
  },
  authorClass: { id: 3, name: '5-1', grade: 5 },
  images: [
    {
      id: 2,
      post_id: 10,
      kind: 'app_capture',
      path: '2026/09/abc.webp',
      width: 720,
      height: 1280,
      sort: 1,
      delete_after: null,
    },
    {
      id: 1,
      post_id: 10,
      kind: 'category_capture',
      path: '/var/app/ras/uploads/2026/09/def.webp',
      width: 720,
      height: 1280,
      sort: 0,
      delete_after: null,
    },
  ],
  report: {
    post_id: 10,
    avg_minutes_per_day: 189,
    top_category: '동영상',
    top_app: '네이버 웹툰',
    prev_avg_minutes: 214,
    diff_minutes: -25,
    goal_achieved: 1,
    goal_reason: '알림을 껐어요',
    teacher_score: 3,
  },
  article: null,
};

// APR-02c 익명 검토: 작성자 식별 정보가 응답에 없어야 한다 (절대 규칙 3)
describe('toReviewerPostView', () => {
  const view = toReviewerPostView(bundle);

  it('작성자 식별 키가 응답 어디에도 없다', () => {
    expect(findIdentifyingKeys(view)).toEqual([]);
  });

  it('"○학년 학생" 표시용 학년만 담는다', () => {
    expect(view.authorGrade).toBe(5);
  });

  it('임원 검토 메모·검토자 id 는 내려보내지 않는다 (APR-08)', () => {
    const json = JSON.stringify(view);
    expect(json).not.toContain('캡처가 다른 화면이에요');
    expect(json).not.toMatch(/council|reviewer/i);
    expect(Object.values(view)).not.toContain(202);
  });

  it('키 집합이 고정되어 있다 (허용목록)', () => {
    expect(Object.keys(view).sort()).toEqual(
      [
        'article',
        'authorGrade',
        'body',
        'goalText',
        'id',
        'images',
        'report',
        'status',
        'submittedAt',
        'title',
        'type',
        'weekKey',
      ].sort(),
    );
  });
});

// 3.1: 학생 화면에는 실명이 절대 없다 (절대 규칙 4)
describe('toStudentPostView', () => {
  const view = toStudentPostView(bundle, 999);

  it('실명(name)·login_id·student_no 가 없다', () => {
    const json = JSON.stringify(view);
    expect(json).not.toContain('김초롱');
    expect(Object.keys(view.author).sort()).toEqual([
      'className',
      'displayName',
      'grade',
      'isReporter',
      'tier',
      'title',
    ]);
  });

  it('마스킹 이름과 반 이름만 보인다', () => {
    expect(view.author.displayName).toBe('김○롱');
    expect(view.author.className).toBe('5-1');
  });

  it('본인 글 여부', () => {
    expect(view.isMine).toBe(false);
    expect(toStudentPostView(bundle, 101).isMine).toBe(true);
  });

  it('검토 이력·반려 사유는 학생 뷰에 없다', () => {
    expect(JSON.stringify(view)).not.toContain('council');
  });
});

describe('toTeacherPostView', () => {
  const view = toTeacherPostView(bundle);

  it('실명·번호·동의 여부·검토 이력을 포함한다', () => {
    expect(view.author.name).toBe('김초롱');
    expect(view.author.studentNo).toBe(7);
    expect(view.author.parentConsent).toBe('Y');
    expect(view.councilReview.reviewerId).toBe(202);
    expect(view.councilReview.note).toBe('캡처가 다른 화면이에요');
    expect(view.report?.teacherScore).toBe(3);
  });
});

describe('이미지', () => {
  it('파일 시스템 경로 대신 /uploads URL, sort 순 정렬', () => {
    const view = toReviewerPostView(bundle);
    expect(view.images.map((i) => i.url)).toEqual([
      '/uploads/2026/09/def.webp',
      '/uploads/2026/09/abc.webp',
    ]);
    expect(JSON.stringify(view)).not.toContain('/var/app');
  });
});

describe('findIdentifyingKeys', () => {
  it('중첩 객체·배열 안의 식별 키도 찾는다', () => {
    expect(findIdentifyingKeys({ a: { name: 'x' }, b: [{ classId: 1 }] })).toEqual([
      'a.name',
      'b[0].classId',
    ]);
  });
});
