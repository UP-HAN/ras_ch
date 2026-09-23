/**
 * 시연용 더미 데이터 (약 일주일치): `npm run db:seed -- --force && npm run db:seed:demo`
 *  - 기본 시드(반·교사·학생·규칙표) 위에 지난주·이번 주 활동을 실제 서비스 함수로 만든다.
 *    → 포인트는 전부 PointService(원장)를 거치고, 승인·검토 이력도 진짜 흐름대로 남는다.
 *  - 지난주: 캡처 리포트·일기 승인(임원 1차 검토 → 교사 승인), 기사 2건 승인, 댓글·좋아요·신고·칭찬
 *  - 이번 주: 리포트 대기(미검토·1차 통과·보류 요청·반려)·기사 대기, 출석 7일, 읽기, 공지, 주간 TOP 스냅샷
 *  - production 거부. 이미 더미 글이 있으면 중단(--force 로 기본 시드부터 다시)
 */
import sharp from 'sharp';
import { isProd } from '../server/src/config/env.js';
import { closePool } from '../server/src/db/pool.js';
import { execute, query, queryOne } from '../server/src/db/query.js';
import { runWeeklyTop } from '../server/src/jobs/weeklyTop.js';
import { dayKey, kst, previousWeekKey, weekKey } from '../server/src/lib/time.js';
import { loadAuthUser } from '../server/src/repos/userRepo.js';
import { LedgerPointService } from '../server/src/services/points/LedgerPointService.js';
import { setPointService } from '../server/src/services/points/PointService.js';
import { applyPointsSafe } from '../server/src/services/points/safeApply.js';
import { teacherBonus } from '../server/src/services/PointsQueryService.js';
import { createArticle, createReport, transition } from '../server/src/services/PostService.js';
import {
  addComment,
  report as reportContent,
  setLike,
} from '../server/src/services/ReactionService.js';
import { submitReview } from '../server/src/services/ReviewService.js';
import type { AuthUser } from '../server/src/types/auth.js';

setPointService(new LedgerPointService());

const CUR = weekKey();
const PREV = previousWeekKey(CUR);
const today = kst();

// ---------- 문장 재료 (초등 3~6학년 말투) ----------
const BODIES = [
  '이번 주에는 유튜브를 제일 많이 봤다. 숙제를 끝내고 잠깐만 보려고 했는데 다음 영상이 자동으로 나와서 한 시간이 훌쩍 지나갔다. 다음 주에는 자동 재생을 끄고 저녁에는 폰을 거실에 두기로 했다. 대신 동생이랑 보드게임을 하기로 약속했다.',
  '게임 시간이 지난주보다 조금 줄었다. 친구들이랑 같이 하다 보면 멈추기가 어려운데, 엄마랑 정한 타이머가 울리면 끄기로 했더니 지킬 수 있었다. 다음 주에는 주말에만 게임을 하고 평일에는 줄넘기를 할 거다.',
  '카톡 알림이 자꾸 와서 폰을 계속 보게 됐다. 그래서 공부할 때는 방해금지 모드를 켰다. 처음에는 답장을 못 해서 불안했는데 나중에 한꺼번에 보내도 괜찮았다. 다음 주에도 방해금지 모드를 꼭 쓰겠다.',
  '이번 주는 폰을 거의 안 썼다. 할머니 댁에 가서 밭일을 도와드리고 저녁에는 별을 봤다. 폰이 없어도 심심하지 않다는 걸 알았다. 다음 주에는 학교 끝나고 도서관에서 책을 한 권 다 읽는 게 목표다.',
  '웹툰을 많이 봤다. 하루에 30분만 보기로 했는데 새로 나온 회차가 많아서 계속 봤다. 대신 잠들기 전에는 안 보려고 폰을 충전기에 꽂고 방 밖에 뒀다. 다음 주에는 웹툰 보는 시간을 정해 두고 지킬 것이다.',
  '동영상 보는 시간을 줄이려고 알림을 껐더니 정말 덜 보게 됐다. 남는 시간에 그림을 그렸는데 생각보다 재미있었다. 다음 주 목표는 하루 평균 사용시간을 두 시간 아래로 만드는 것이다.',
];
const DIARIES = [
  '이번 주는 폰 없이 지냈다. 처음에는 친구들 소식이 궁금했는데 학교에서 직접 물어보니까 더 재미있었다. 저녁에는 가족이랑 산책을 했다. 다음 주에도 폰 없이 밖에서 노는 날을 세 번은 만들고 싶다.',
  '폰 대신 책을 읽었다. 도서관에서 빌린 추리 소설이 너무 재미있어서 하루 만에 다 읽었다. 폰이 없으니 밤에 잠도 일찍 잤다. 다음 주에는 과학책도 한 권 읽어 볼 생각이다.',
];
const GOALS = [
  '저녁 9시 이후 폰 안 보기',
  '하루 30분 줄이기',
  '자동 재생 끄기',
  '주말에만 게임하기',
  '자기 전에는 폰을 거실에 두기',
  '방해금지 모드 켜기',
];
const CATS = ['동영상', '게임', 'SNS', '메신저', '웹툰·만화', '학습'];
const APPS = ['유튜브', '로블록스', '인스타그램', '카카오톡', '네이버 웹툰', '클래스팅'];
const COMMENTS = [
  '자동 재생 끄기 좋은 방법이에요! 나도 해 볼게요.',
  '타이머 울리면 끄는 거 정말 대단해요. 응원합니다!',
  '방해금지 모드는 어떻게 켜요? 알려 주세요.',
  '할머니 댁에서 별 본 거 부러워요. 다음 주도 화이팅!',
  '나도 웹툰 시간 정해 두고 볼게요. 같이 지켜요!',
  '그림 그린 거 다음에 보여 주세요. 멋져요!',
  '목표 지키는 모습이 멋져요. 저도 따라 할래요.',
  '한 시간이 훌쩍 지나가는 거 저도 그래요. 같이 줄여 봐요!',
];
const ARTICLES = [
  {
    title: '토요 스포츠데이 배구 결승전, 끝까지 포기하지 않았다',
    type: 'coverage',
    tags: ['S', 'A'],
    body: '지난 토요일 운동장에서 스포츠데이 배구 결승전이 열렸다. 5학년 1반과 6학년 1반이 맞붙었고, 학생들이 직접 심판과 기록을 맡았다. 서브가 넘어갈 때마다 응원 소리가 커졌고 마지막 세트는 듀스까지 갔다. 결국 6학년이 이겼지만 5학년도 끝까지 포기하지 않아서 모두 박수를 받았다. 다음 스포츠데이에는 피구 경기도 열린다고 한다. 체육 선생님은 "규칙을 지키며 즐기는 모습이 가장 좋았다"고 말씀하셨다.',
    oneLine: '다음에도 꼭 참가하고 싶다',
  },
  {
    title: '달빛 도서관에 다녀온 사서 선생님 인터뷰',
    type: 'interview',
    tags: ['R'],
    body: '사서 선생님께 달빛 도서관 행사에 대해 여쭤보았다. 달빛 도서관은 저녁에 도서관 불을 은은하게 켜고 책을 읽는 행사다. 선생님은 "폰 대신 책과 친해지는 시간을 만들고 싶었다"고 하셨다. 참가한 친구들은 손전등으로 책을 읽는 게 신기했다고 말했다. 다음 달에는 3학년도 참가할 수 있다고 한다. 신청은 도서관 앞 게시판에서 할 수 있다. 책을 좋아하는 친구들에게 꼭 추천하고 싶다.',
    oneLine: '책 읽는 밤이 이렇게 재밌을 줄 몰랐어요',
  },
  {
    title: '폰 없는 하루 챌린지 후기',
    type: 'review',
    tags: ['phonefree'],
    body: '우리 반은 지난주 수요일에 폰 없는 하루 챌린지를 했다. 아침에 폰을 담임 선생님께 맡기고 하루를 보냈다. 처음에는 손이 심심했는데 점심시간에 친구들이랑 공기놀이를 하니까 시간이 금방 갔다. 집에 가서도 폰을 안 보고 그림을 그렸다. 저녁에 엄마가 "오늘 표정이 밝다"고 하셨다. 다음에는 이틀 연속으로 도전해 보고 싶다. 친구들도 꼭 한번 해 보면 좋겠다.',
    oneLine: '손이 심심하면 공기놀이가 최고',
  },
];
const REVIEW_OK = { captures_match: true, body_length: true, goal_present: true, clean: true };

// ---------- 가짜 캡처 이미지(폰 화면 모양, 글자 없음) ----------
async function fakeCapture(kind: 'category' | 'app', seed: number): Promise<Buffer> {
  const bars = Array.from({ length: 5 }, (_, i) => {
    const w = 560 - ((i * 97 + seed * 31) % 380);
    const y = 420 + i * 150;
    const color = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b', '#845ef7'][i];
    return `<rect x="120" y="${y}" width="${w}" height="70" rx="12" fill="${color}"/><circle cx="70" cy="${y + 35}" r="28" fill="#dee2e6"/>`;
  }).join('');
  const header = kind === 'category' ? '#1e3a5f' : '#2b8a3e';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1400"><rect width="720" height="1400" fill="#f8f9fa"/><rect width="720" height="140" fill="${header}"/><rect x="40" y="200" width="640" height="150" rx="16" fill="#e9ecef"/><rect x="70" y="240" width="${220 + (seed % 5) * 40}" height="30" rx="6" fill="#495057"/><rect x="70" y="290" width="160" height="22" rx="6" fill="#adb5bd"/>${bars}<rect x="40" y="1260" width="640" height="90" rx="16" fill="#e9ecef"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
const file = (buffer: Buffer) => ({ buffer, size: buffer.length });

async function student(loginId: string): Promise<AuthUser> {
  const row = await queryOne<{ id: number }>('SELECT id FROM users WHERE login_id = ?', [loginId]);
  const u = row && (await loadAuthUser(row.id));
  if (!u) throw new Error(`계정 없음: ${loginId}`);
  return u;
}
const pick = <T>(arr: T[], i: number): T => arr[i % arr.length] as T;
const at = (daysAgo: number, hour: number) =>
  today
    .subtract(daysAgo, 'day')
    .hour(hour)
    .minute((daysAgo * 17) % 60)
    .second(0)
    .format('YYYY-MM-DD HH:mm:ss');

async function main(): Promise<void> {
  if (isProd) throw new Error('production 환경에서는 더미 데이터를 넣을 수 없습니다.');
  const existing = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM posts');
  if (Number(existing?.n ?? 0) > 0)
    throw new Error(
      '이미 글이 있습니다. `npm run db:seed -- --force` 로 기본 시드부터 다시 넣은 뒤 실행하세요.',
    );

  const teachers = {
    t3: await student('t3@ches.es.kr'),
    t4: await student('t4@ches.es.kr'),
    t5: await student('t5@ches.es.kr'),
    admin: await student('admin@ches.es.kr'),
  };
  const homeroom: Record<number, AuthUser> = {
    3: teachers.t3,
    4: teachers.t4,
    5: teachers.t5,
    6: teachers.admin,
  };
  const council = { g34: await student('265101'), g56: await student('266101') };
  const students = await query<{
    login_id: string;
    grade: number;
    parent_consent: 'Y' | 'N';
    is_reporter: 0 | 1;
  }>(
    "SELECT u.login_id, c.grade, u.parent_consent, u.is_reporter FROM users u JOIN classes c ON c.id = u.class_id WHERE u.role = 'student' AND u.status = 'active' ORDER BY c.grade, u.student_no",
  );
  const all: AuthUser[] = [];
  for (const s of students) all.push(await student(s.login_id));
  const reviewerFor = (u: AuthUser) => (u.klass && u.klass.grade <= 4 ? council.g34 : council.g56);

  // 1) 출석 7일 (오늘 포함) — login_days + DAILY_LOGIN(원장, 그날 날짜로)
  for (const [i, u] of all.entries()) {
    const days = 3 + (i % 5); // 3~7일
    for (let d = days - 1; d >= 0; d -= 1) {
      const dk = dayKey(today.subtract(d, 'day'));
      await execute(
        'INSERT IGNORE INTO login_days (user_id, day_key, first_seen_at) VALUES (?, ?, ?)',
        [u.row.id, dk, `${dk} 07:${String((i * 7) % 60).padStart(2, '0')}:00`],
      );
      await applyPointsSafe({
        ruleCode: 'DAILY_LOGIN',
        userId: u.row.id,
        refType: 'login_day',
        refId: Number(dk.replace(/-/g, '')),
        occurredAt: today.subtract(d, 'day').toDate(),
        eventKey: `DAILY_LOGIN:${u.row.id}:${dk}`,
      });
    }
  }
  console.log('출석 완료');

  // 2) 지난주 리포트: 학생 3명 중 2명꼴 제출 → 임원 1차 통과(다른 학년 임원) → 담임 승인
  const lastWeekPosts: Array<{ id: number; author: AuthUser }> = [];
  let n = 0;
  for (const u of all) {
    n += 1;
    if (n % 3 === 0) continue; // 미제출
    const consent = u.row.parent_consent === 'Y';
    const avg = 90 + ((n * 37) % 150);
    const bundle = await createReport(
      u,
      {
        type: consent ? 'report' : 'diary',
        weekKey: PREV,
        visibility: n % 2 ? 'school' : 'class',
        avgMinutes: consent ? avg : null,
        topCategory: consent ? pick(CATS, n) : null,
        topApp: consent ? pick(APPS, n) : null,
        body: consent ? pick(BODIES, n) : pick(DIARIES, n),
        goalText: pick(GOALS, n),
        goalAchieved: null,
        goalReason: null,
        submit: true,
      },
      consent
        ? {
            category_capture: file(await fakeCapture('category', n)),
            app_capture: file(await fakeCapture('app', n)),
          }
        : {},
    );
    const post = bundle.post;
    // 임원 검토: 본인·같은 반은 검토 못 하므로 그 경우 교사 직접 승인
    const reviewer = reviewerFor(u);
    if (reviewer.row.class_id !== u.row.class_id && n % 4 !== 0) {
      try {
        await submitReview(reviewer, post.id, { result: 'pass', checklist: REVIEW_OK });
      } catch {
        /* 상한 등 */
      }
    }
    if (n % 7 !== 0) {
      await transition(post.id, 'approve', homeroom[u.klass?.grade ?? 6] as AuthUser);
      lastWeekPosts.push({ id: post.id, author: u });
    }
    // 시간을 지난주로 보정
    const d = 7 + (n % 5); // 7~11일 전
    await execute(
      'UPDATE posts SET created_at = ?, submitted_at = ?, approved_at = IF(approved_at IS NULL, NULL, ?), updated_at = ? WHERE id = ?',
      [at(d, 19), at(d, 19), at(d - 1, 9), at(d - 1, 9), post.id],
    );
  }
  console.log(`지난주 리포트 ${lastWeekPosts.length}건 승인`);

  // 3) 이번 주 리포트: 일부만 제출 → 미검토 / 1차 통과 / 보류 요청 / 반려 / 초안
  let m = 0;
  for (const u of all) {
    m += 1;
    if (m % 3 !== 1) continue;
    const consent = u.row.parent_consent === 'Y';
    const bundle = await createReport(
      u,
      {
        type: consent ? 'report' : 'diary',
        weekKey: CUR,
        visibility: 'class',
        avgMinutes: consent ? 80 + ((m * 53) % 120) : null,
        topCategory: consent ? pick(CATS, m + 2) : null,
        topApp: consent ? pick(APPS, m + 2) : null,
        body: consent ? pick(BODIES, m + 3) : pick(DIARIES, m),
        goalText: pick(GOALS, m + 1),
        goalAchieved: m % 2 === 0,
        goalReason:
          m % 2 === 0 ? '알림을 꺼 두니까 덜 보게 됐어요' : '주말에 게임을 너무 많이 했어요',
        submit: m % 9 !== 4, // 하나는 초안
      },
      consent
        ? {
            category_capture: file(await fakeCapture('category', m + 9)),
            app_capture: file(await fakeCapture('app', m + 9)),
          }
        : {},
    );
    const post = bundle.post;
    const reviewer = reviewerFor(u);
    const canReview = reviewer.row.class_id !== u.row.class_id && post.status === 'pending';
    if (canReview && m % 9 === 1)
      await submitReview(reviewer, post.id, { result: 'pass', checklist: REVIEW_OK }).catch(
        () => undefined,
      );
    if (canReview && m % 9 === 7)
      await submitReview(reviewer, post.id, {
        result: 'hold',
        checklist: { ...REVIEW_OK, captures_match: false },
        note: '캡처가 안내한 화면과 달라요. 사용시간 화면과 앱 순위 화면을 올려 주세요.',
      }).catch(() => undefined);
    if (post.status === 'pending' && m % 9 === 10)
      await transition(post.id, 'reject', homeroom[u.klass?.grade ?? 6] as AuthUser, {
        reasonCode: 'too_short',
      });
    const d = m % 3; // 0~2일 전
    await execute(
      'UPDATE posts SET created_at = ?, submitted_at = IF(submitted_at IS NULL, NULL, ?), updated_at = ? WHERE id = ?',
      [at(d, 20), at(d, 20), at(d, 20), post.id],
    );
  }
  // 반려 1건 (미검토 글 중 하나)
  const pendingOne = await queryOne<{ id: number; grade: number }>(
    "SELECT id, grade FROM posts WHERE status = 'pending' AND week_key = ? ORDER BY id LIMIT 1",
    [CUR],
  );
  if (pendingOne)
    await transition(pendingOne.id, 'reject', homeroom[pendingOne.grade] as AuthUser, {
      reasonCode: 'too_short',
    });
  console.log('이번 주 리포트 대기함 구성');

  // 4) 기사: 기자단 2명 + 1명, 2건 승인 1건 대기
  const reporters = all.filter((u) => u.row.is_reporter === 1).slice(0, 2);
  const writers = [
    ...reporters,
    all.find((u) => u.row.is_reporter !== 1 && (u.klass?.grade ?? 0) >= 5) as AuthUser,
  ];
  const articleIds: number[] = [];
  for (const [i, w] of writers.entries()) {
    const a = ARTICLES[i] as (typeof ARTICLES)[number];
    const photo = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: ['#88aa44', '#4488aa', '#aa6644'][i],
      },
    })
      .jpeg()
      .toBuffer();
    const bundle = await createArticle(
      w,
      {
        title: a.title,
        tags: a.tags,
        articleType: a.type,
        body: a.body,
        oneLine: a.oneLine,
        submit: true,
      },
      [file(photo)],
    );
    if (i < 2) {
      await transition(bundle.post.id, 'approve', teachers.admin);
      articleIds.push(bundle.post.id);
      await execute(
        'UPDATE posts SET created_at = ?, submitted_at = ?, approved_at = ?, updated_at = ? WHERE id = ?',
        [at(5 - i, 16), at(5 - i, 16), at(4 - i, 9), at(4 - i, 9), bundle.post.id],
      );
    } else {
      await execute(
        'UPDATE posts SET created_at = ?, submitted_at = ?, updated_at = ? WHERE id = ?',
        [at(0, 15), at(0, 15), at(0, 15), bundle.post.id],
      );
    }
  }
  if (articleIds[0])
    await execute('UPDATE article_details SET is_featured = 1 WHERE post_id = ?', [articleIds[0]]);
  console.log('기사 3건');

  // 5) 댓글·좋아요·신고 (승인된 글에, 본인 글 제외)
  const targets = [...lastWeekPosts.map((p) => p.id), ...articleIds];
  let c = 0;
  const commentIds: number[] = [];
  for (const [i, u] of all.entries()) {
    for (let k = 0; k < 2; k += 1) {
      const pid = pick(targets, i * 3 + k * 5);
      const owner = await queryOne<{ author_id: number; visibility: string; class_id: number }>(
        'SELECT author_id, visibility, class_id FROM posts WHERE id = ?',
        [pid],
      );
      if (!owner || owner.author_id === u.row.id) continue;
      if (owner.visibility !== 'school' && owner.class_id !== u.row.class_id) continue;
      await setLike(u, 'post', pid, true).catch(() => undefined);
      if ((i + k) % 2 === 0) {
        try {
          const cm = await addComment(u, pid, pick(COMMENTS, c));
          commentIds.push(cm.comment.id);
          c += 1;
        } catch {
          /* 글당 3개 상한 등 */
        }
      }
    }
  }
  // 댓글 좋아요 몇 개 + 신고 1건
  for (const [i, u] of all.slice(0, 8).entries()) {
    const cid = pick(commentIds, i * 2);
    if (cid) await setLike(u, 'comment', cid, true).catch(() => undefined);
  }
  if (commentIds[3])
    await reportContent(
      all[all.length - 1] as AuthUser,
      'comment',
      commentIds[3],
      '놀리는 말 같아요',
    ).catch(() => undefined);
  await execute(
    'UPDATE comments SET created_at = DATE_SUB(NOW(3), INTERVAL FLOOR(RAND() * 6) DAY), updated_at = created_at',
  );
  await execute('UPDATE likes SET created_at = DATE_SUB(NOW(3), INTERVAL FLOOR(RAND() * 6) DAY)');
  console.log(`댓글 ${commentIds.length}개, 좋아요, 신고 1건`);

  // 6) 읽기 (post_reads + POST_READ)
  for (const [i, u] of all.entries()) {
    const pid = pick(targets, i * 7 + 1);
    const owner = await queryOne<{ author_id: number }>(
      'SELECT author_id FROM posts WHERE id = ?',
      [pid],
    );
    if (!owner || owner.author_id === u.row.id) continue;
    await execute(
      "INSERT IGNORE INTO post_reads (user_id, target_type, target_id, opened_at, completed_at) VALUES (?, 'post', ?, ?, ?)",
      [u.row.id, pid, at(i % 4, 21), at(i % 4, 21)],
    );
    await applyPointsSafe({
      ruleCode: 'POST_READ',
      userId: u.row.id,
      refType: 'post',
      refId: pid,
      occurredAt: today.subtract(i % 4, 'day').toDate(),
      eventKey: `POST_READ:post:${pid}:${u.row.id}`,
    });
  }

  // 7) 교사 칭찬 2건
  const g4 = all.filter((u) => u.klass?.grade === 4);
  if (g4[0])
    await teacherBonus(teachers.t4, g4[0].row.id, 10, '목표를 지키려고 노력했어요').catch(
      () => undefined,
    );
  if (g4[3])
    await teacherBonus(teachers.t4, g4[3].row.id, 15, '친구 글에 따뜻한 댓글을 남겼어요').catch(
      () => undefined,
    );

  // 8) 지금 보이는 공지 + 주간 TOP 스냅샷(지난주)
  await execute(
    'INSERT INTO notices (title, body, starts_at, ends_at, author_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    [
      '이번 주 일요일까지 리포트를 올려요',
      '폰 사용시간 캡처 2장과 성찰 글 100자 이상! 어려우면 담임 선생님께 물어보세요.',
      at(3, 8),
      today.add(10, 'day').format('YYYY-MM-DD 23:59:00'),
      teachers.admin.row.id,
    ],
  );
  await runWeeklyTop(PREV);

  const stats = await query<{ t: string; n: number }>(
    `SELECT 'posts' AS t, COUNT(*) AS n FROM posts UNION ALL SELECT 'comments', COUNT(*) FROM comments UNION ALL SELECT 'likes', COUNT(*) FROM likes
     UNION ALL SELECT 'point_ledger', COUNT(*) FROM point_ledger UNION ALL SELECT 'login_days', COUNT(*) FROM login_days UNION ALL SELECT 'weekly_scores', COUNT(*) FROM weekly_scores`,
  );
  const byStatus = await query<{ status: string; n: number }>(
    'SELECT status, COUNT(*) AS n FROM posts GROUP BY status',
  );
  console.log('더미 데이터 완료:', stats.map((s) => `${s.t} ${s.n}`).join(', '));
  console.log('글 상태:', byStatus.map((s) => `${s.status} ${s.n}`).join(', '));
  console.log(
    '로그인: 학생 26학년반번(예 264102) / 1234, 교사 t3@ches.es.kr·t4·t5·admin@ches.es.kr / teacher1234! (첫 로그인 때 새 비밀번호로 변경)',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
