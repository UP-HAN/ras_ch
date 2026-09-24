/**
 * 시연용 "한 달치 활동" 데이터: `npm run db:seed -- --force && npm run db:seed:showcase`
 *  - 6학년 1~8반 시범 명단 위에 지난 6주(+이번 주) 활동을 채운다: 리포트·기사·댓글·엄지척·읽기·출석·
 *    토론(투표·의견·베스트)·자치회 글·주간 선물·지난달 결산·칭찬·공지·신고 → 등급·칭호·미션까지
 *  - 학생마다 페르소나(열심/보통/가끔)를 결정적 난수로 정해 활동량·말투·등급이 다양하다
 *  - 과거 시각이 필요한 글·댓글·좋아요·투표는 repo 함수 + applyPointsSafe({ occurredAt }) 로 넣는다
 *    (포인트는 전부 원장·규칙표·상한을 거친다, 절대 규칙 1). 승인·검토·베스트·선물·결산은 서비스 함수 그대로.
 *  - production 거부(운영에서 한 번 쓰려면 NODE_ENV=development 로). 글이 이미 있으면 중단.
 *  - 리셋: `NODE_ENV=development npm run db:seed -- --force` + uploads 비우기
 */
import sharp from 'sharp';
import { isProd } from '../server/src/config/env.js';
import { closePool } from '../server/src/db/pool.js';
import { execute, query, queryOne, tx } from '../server/src/db/query.js';
import { runRecountCaches } from '../server/src/jobs/recountCaches.js';
import { runNewsReserve } from '../server/src/jobs/newsJobs.js';
import { runWeeklyTop } from '../server/src/jobs/weeklyTop.js';
import { isStreakBonusDay, streakBlockKey } from '../server/src/lib/attendance.js';
import { processCapture, saveImage } from '../server/src/lib/image.js';
import { diffMinutes } from '../server/src/lib/reportRules.js';
import {
  kst,
  monthKey,
  previousMonthKey,
  previousWeekKey,
  toDbDateTime,
  weekKey,
  weekRange,
} from '../server/src/lib/time.js';
import * as commentRepo from '../server/src/repos/commentRepo.js';
import * as councilRepo from '../server/src/repos/councilRepo.js';
import * as likeRepo from '../server/src/repos/likeRepo.js';
import * as newsRepo from '../server/src/repos/newsRepo.js';
import * as postRepo from '../server/src/repos/postRepo.js';
import { loadAuthUser } from '../server/src/repos/userRepo.js';
import { saveApprovalSetting } from '../server/src/services/AdminSettingsService.js';
import * as councilAdmin from '../server/src/services/CouncilAdminService.js';
import * as councilPosts from '../server/src/services/CouncilPostService.js';
import * as newsAdmin from '../server/src/services/NewsAdminService.js';
import { selectBest } from '../server/src/services/NewsService.js';
import { createNotice } from '../server/src/services/NoticeService.js';
import { LedgerPointService } from '../server/src/services/points/LedgerPointService.js';
import { setPointService } from '../server/src/services/points/PointService.js';
import { applyPointsSafe } from '../server/src/services/points/safeApply.js';
import { buildEventKey } from '../server/src/services/points/types.js';
import { teacherBonus } from '../server/src/services/PointsQueryService.js';
import { createArticle, transition } from '../server/src/services/PostService.js';
import { report as reportContent } from '../server/src/services/ReactionService.js';
import { confirmSettlement } from '../server/src/services/settlement/confirm.js';
import { ensureDraft } from '../server/src/services/settlement/draft.js';
import { settlementView } from '../server/src/services/settlement/views.js';
import * as weeklyGifts from '../server/src/services/WeeklyGiftService.js';
import type { AuthUser } from '../server/src/types/auth.js';

setPointService(new LedgerPointService());

// ---------- 결정적 난수 ----------
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20260924);
const chance = (p: number) => R() < p;
const between = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));
const pickR = <T>(arr: readonly T[]): T => arr[Math.floor(R() * arr.length)] as T;
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(R() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
};

// ---------- 기간 ----------
const today = kst();
const CUR = weekKey();
const WEEKS: string[] = [];
{
  let k = CUR;
  for (let i = 0; i < 6; i += 1) {
    k = previousWeekKey(k);
    WEEKS.unshift(k);
  }
}
const LAST_MONTH = previousMonthKey(monthKey());
/** 그 주차의 요일·시각 (0=월) */
const wkAt = (wk: string, dow: number, hour: number, minute = 0) =>
  weekRange(wk).start.add(dow, 'day').hour(hour).minute(minute).second(0);
const db = (d: ReturnType<typeof kst>) => toDbDateTime(d);

// ---------- 문장 재료 (초등 6학년 말투) ----------
const BODIES = [
  '이번 주에는 유튜브를 제일 많이 봤다. 숙제를 끝내고 잠깐만 보려고 했는데 다음 영상이 자동으로 나와서 한 시간이 훌쩍 지나갔다. 다음 주에는 자동 재생을 끄고 저녁에는 폰을 거실에 두기로 했다. 대신 동생이랑 보드게임을 하기로 약속했다.',
  '게임 시간이 지난주보다 조금 줄었다. 친구들이랑 같이 하다 보면 멈추기가 어려운데, 엄마랑 정한 타이머가 울리면 끄기로 했더니 지킬 수 있었다. 다음 주에는 주말에만 게임을 하고 평일에는 줄넘기를 할 거다.',
  '카톡 알림이 자꾸 와서 폰을 계속 보게 됐다. 그래서 공부할 때는 방해금지 모드를 켰다. 처음에는 답장을 못 해서 불안했는데 나중에 한꺼번에 보내도 괜찮았다. 다음 주에도 방해금지 모드를 꼭 쓰겠다.',
  '이번 주는 폰을 거의 안 썼다. 할머니 댁에 가서 밭일을 도와드리고 저녁에는 별을 봤다. 폰이 없어도 심심하지 않다는 걸 알았다. 다음 주에는 학교 끝나고 도서관에서 책을 한 권 다 읽는 게 목표다.',
  '웹툰을 많이 봤다. 하루에 30분만 보기로 했는데 새로 나온 회차가 많아서 계속 봤다. 대신 잠들기 전에는 안 보려고 폰을 충전기에 꽂고 방 밖에 뒀다. 다음 주에는 웹툰 보는 시간을 정해 두고 지킬 것이다.',
  '동영상 보는 시간을 줄이려고 알림을 껐더니 정말 덜 보게 됐다. 남는 시간에 그림을 그렸는데 생각보다 재미있었다. 다음 주 목표는 하루 평균 사용시간을 두 시간 아래로 만드는 것이다.',
  '학원 끝나고 버스에서 쇼츠를 계속 넘기다가 내릴 정류장을 지나칠 뻔했다. 그날부터 버스에서는 폰을 가방에 넣고 창밖을 봤다. 생각보다 볼 게 많았다. 다음 주에는 이동할 때 폰을 꺼내지 않는 걸 목표로 한다.',
  '주말에 가족이랑 캠핑을 가서 폰이 잘 안 터졌다. 처음엔 답답했는데 불 피우고 감자 굽는 게 훨씬 재밌었다. 평일에는 숙제 끝나고 게임을 한 시간 했다. 다음 주에는 게임을 40분으로 줄여 볼 것이다.',
  '친구들이랑 단톡방에서 밤늦게까지 이야기하다가 아침에 늦게 일어났다. 그래서 밤 10시에는 폰을 엄마한테 맡기기로 했다. 이틀은 실패했지만 나머지는 지켰다. 다음 주에는 일주일 내내 지키고 싶다.',
  '이번 주에는 사용시간이 늘었다. 새로 나온 게임 때문이다. 솔직히 조절이 잘 안 됐다. 그래도 리포트를 쓰면서 얼마나 했는지 눈으로 보니까 놀랐다. 다음 주에는 게임 전에 알람을 맞추고 시작하겠다.',
  '축구 연습 때문에 폰 볼 시간이 별로 없었다. 저녁에는 피곤해서 바로 잤다. 몸을 움직이면 폰 생각이 덜 난다는 걸 느꼈다. 다음 주에도 방과 후 운동을 세 번 하고 사용시간을 지금처럼 유지하는 게 목표다.',
  '동생이랑 폰 없이 하루 보내기 내기를 했다. 내가 이겼다! 그날은 종이접기랑 퍼즐을 했다. 다른 날은 평소처럼 봤지만 하루라도 안 보니까 자신감이 생겼다. 다음 주에는 이틀 도전할 것이다.',
];
const DIARIES = [
  '이번 주는 폰 없이 지냈다. 처음에는 친구들 소식이 궁금했는데 학교에서 직접 물어보니까 더 재미있었다. 저녁에는 가족이랑 산책을 했다. 다음 주에도 폰 없이 밖에서 노는 날을 세 번은 만들고 싶다.',
  '폰 대신 책을 읽었다. 도서관에서 빌린 추리 소설이 너무 재미있어서 하루 만에 다 읽었다. 폰이 없으니 밤에 잠도 일찍 잤다. 다음 주에는 과학책도 한 권 읽어 볼 생각이다.',
  '폰 없이 지내면서 그림일기를 다시 쓰기 시작했다. 하루에 한 장씩 그리니까 일주일이 어떻게 지나갔는지 잘 보였다. 다음 주에는 색연필로 색칠까지 해서 친구들에게 보여 주고 싶다.',
  '이번 주에는 엄마 폰으로 급한 연락만 했다. 심심할 때는 줄넘기를 했는데 이제 이중 뛰기가 열 번 된다. 다음 주에는 스무 번을 목표로 연습할 것이다.',
];
const GOALS = [
  '저녁 9시 이후 폰 안 보기',
  '하루 30분 줄이기',
  '자동 재생 끄기',
  '주말에만 게임하기',
  '자기 전에는 폰을 거실에 두기',
  '방해금지 모드 켜기',
  '버스에서 폰 안 꺼내기',
  '숙제 먼저 끝내고 폰 보기',
];
const GOAL_REASONS_OK = [
  '알림을 꺼 두니까 덜 보게 됐어요',
  '엄마가 도와주셔서 지킬 수 있었어요',
  '타이머를 맞추니까 멈출 수 있었어요',
  '운동하느라 폰 볼 시간이 없었어요',
];
const GOAL_REASONS_NO = [
  '주말에 게임을 너무 많이 했어요',
  '친구들 단톡방 때문에 늦게까지 봤어요',
  '새로 나온 웹툰을 다 봐 버렸어요',
];
const CATS = ['동영상', '게임', 'SNS', '메신저', '웹툰·만화', '학습'];
const APPS = ['유튜브', '로블록스', '인스타그램', '카카오톡', '네이버 웹툰', '클래스팅'];
const REJECT_CODES = ['too_short', 'capture_mismatch', 'other'] as const;

/** 댓글: 레벨별 여는 말 × 본문을 조합해 같은 문장이 거의 안 나오게 한다 */
const COMMENT_OPEN = {
  high: [
    '글 잘 읽었어요.',
    '와, 이번 주 정말 열심히 했네요.',
    '읽으면서 저도 반성했어요.',
    '솔직하게 써서 더 와닿아요.',
    '목표가 구체적이라 좋아요.',
    '이 방법 저도 써 봤는데요,',
    '지난주 글이랑 비교해 보니',
    '숫자를 보니까 놀랐어요.',
    '응원하고 싶어서 댓글 남겨요.',
    '저랑 상황이 비슷해서 반가웠어요.',
  ],
  mid: [
    '멋져요!',
    '잘 읽었어요.',
    '와 대단해요.',
    '저도 그래요.',
    '좋은 생각이에요.',
    '응원해요!',
    '공감돼요.',
    '고마워요.',
  ],
  low: ['멋져요!', '대단해요.', '응원해요.', '좋아요!', '와!'],
} as const;
const COMMENT_BODY = {
  high: [
    '자동 재생을 끄는 건 저도 해 봤는데 정말 효과가 있더라고요. 다음 주엔 알림까지 꺼 보는 건 어때요?',
    '타이머가 울리면 바로 끄는 게 제일 어려운데 그걸 지켰다니 대단해요. 비결이 궁금해요.',
    '폰 없이 밖에 나가서 논 이야기 읽으니까 저도 주말에 자전거 타러 가고 싶어졌어요.',
    '사용시간이 늘었어도 이유를 정확히 쓴 게 좋아요. 저는 게임 전에 알람 맞추는 걸 추천해요.',
    '방해금지 모드는 설정 앱에서 켤 수 있어요. 공부 시간에만 켜 두면 알림이 안 와서 편해요.',
    '운동하면 폰 생각이 덜 난다는 말 완전 공감해요. 저는 줄넘기 하고 나면 폰을 안 찾게 돼요.',
    '동생이랑 내기하는 아이디어 재밌어요. 저도 이번 주말에 가족이랑 해 보고 결과 알려 드릴게요.',
    '그림일기 아이디어 좋아요. 손으로 무언가 만드는 시간이 폰 보는 시간보다 오래 기억에 남는 것 같아요.',
    '밤 10시에 폰을 맡기는 건 처음 며칠이 제일 힘들어요. 사흘만 지나면 익숙해지니까 포기하지 마요.',
    '웹툰 회차가 쌓이면 저도 참기 어려운데, 토요일에 몰아서 보기로 정하니까 평일이 편해졌어요.',
    '버스에서 폰 안 꺼내기 목표 멋져요. 저는 창밖 간판 읽기 놀이를 하면서 참았어요.',
    '단톡방은 알림을 꺼 두고 저녁에 한 번만 확인하면 훨씬 덜 보게 돼요. 한번 해 보세요.',
    '캠핑 가서 폰이 안 터졌던 이야기 부러워요. 그런 날이 일주일에 하루만 있어도 좋겠어요.',
    '목표를 지킨 날과 못 지킨 날을 나눠서 쓴 게 인상적이에요. 저도 다음 리포트에 그렇게 써 볼게요.',
    '학원 끝나고 쇼츠 보다가 정류장 지나칠 뻔한 거, 저도 비슷한 적 있어서 웃었어요. 조심해요!',
    '하루 두 시간 아래로 만드는 목표 응원해요. 저는 한 시간 반이 목표인데 같이 도전해요.',
    '거실에 폰 두고 자니까 아침에 일어나기가 쉬워졌다는 친구가 많아요. 효과 있는 방법이에요.',
    '읽고 나니까 저도 이번 주 목표를 다시 정하고 싶어졌어요. 좋은 글 고마워요.',
  ],
  mid: [
    '자동 재생 끄기 저도 해 볼게요.',
    '타이머 울리면 끄는 거 정말 대단해요.',
    '웹툰 시간 정해 두고 보는 거 같이 지켜요.',
    '목표 지키는 모습이 멋져요. 따라 할래요.',
    '한 시간이 훌쩍 지나가는 거 저도 그래요. 같이 줄여 봐요.',
    '캠핑 이야기 재밌어요. 다음 주도 화이팅!',
    '밤 10시에 폰 맡기기 좋은 생각이에요.',
    '축구 연습 열심히 하는 거 멋져요.',
    '거실에 폰 두는 거 저도 하고 있어요. 효과 좋아요.',
    '다음 주 목표도 꼭 지키길 바라요.',
    '방해금지 모드 저도 켜 볼게요.',
    '동생이랑 내기하는 거 재밌겠어요.',
    '그림 그리는 시간이 늘었다니 좋아요.',
    '사용시간 줄인 거 축하해요!',
    '솔직하게 쓴 게 좋아요. 다음 주엔 더 잘될 거예요.',
    '저도 알림 끄고 나서 덜 보게 됐어요.',
  ],
  low: [
    '다음 주도 화이팅!',
    '나도 해 볼래요.',
    '좋은 방법이네요.',
    '저도 줄여 볼게요.',
    '같이 해요!',
    '파이팅이에요!',
    '잘했어요!',
    '멋진 목표예요.',
  ],
} as const;
const COMMENT_CLOSE = [
  '',
  ' 다음 주도 화이팅!',
  ' 같이 지켜요.',
  ' 저도 따라 할게요.',
  ' 응원할게요!',
  ' 궁금한 건 물어보세요.',
  ' 힘내요!',
];
const usedComments = new Set<string>();
function commentText(level: Level): string {
  for (let i = 0; i < 30; i += 1) {
    const close = level === 'high' ? '' : pickR(COMMENT_CLOSE);
    const t = `${pickR(COMMENT_OPEN[level])} ${pickR(COMMENT_BODY[level])}${close}`;
    if (!usedComments.has(t) || i === 29) {
      usedComments.add(t);
      return t;
    }
  }
  return pickR(COMMENT_BODY[level]);
}

/** 토론 7주치: 주제(은행 id)별로 전부 다른 의견 */
interface TopicPlan {
  bankId: number;
  agree?: string[];
  disagree?: string[];
  open?: string[];
}
const TOPIC_PLAN: TopicPlan[] = [
  {
    bankId: 1, // 학교에 스마트폰 보관함이 꼭 필요할까?
    agree: [
      '나는 찬성해요. 보관함에 넣어 두면 수업 시간에 폰 생각이 안 나서 집중이 잘될 것 같아요.',
      '찬성이에요. 쉬는 시간마다 폰 꺼내는 친구가 많은데 보관함이 있으면 다 같이 안 보게 돼요.',
      '보관함이 있으면 잃어버릴 걱정이 없어서 찬성해요. 작년에 폰을 잃어버린 친구가 있었어요.',
      '내 생각에는 찬성이에요. 규칙이 눈에 보여야 지키기 쉬우니까요.',
      '찬성해요. 아침에 넣고 집에 갈 때 찾으면 하루가 훨씬 조용할 것 같아요.',
      '나는 찬성해요. 폰이 가방에 있으면 자꾸 만지게 되는데 보관함이면 참을 수 있어요.',
      '찬성이에요. 대신 급한 일이 있으면 선생님께 말하고 꺼내게 하면 돼요.',
      '보관함에 넣으면 친구 얼굴 보고 이야기할 시간이 늘어나서 찬성해요.',
      '찬성해요. 우리 반은 이미 상자에 모아 두는데 싸움이 줄었어요.',
      '나는 찬성이에요. 폰이 없으면 쉬는 시간에 운동장에 나가게 될 것 같아요.',
      '찬성해요. 스스로 참는 건 어렵지만 보관함이 있으면 도움을 받는 거예요.',
      '찬성이에요. 학교는 공부하고 친구랑 노는 곳이니까 폰은 잠깐 쉬어도 돼요.',
    ],
    disagree: [
      '나는 반대해요. 급한 일이 생기면 부모님께 바로 연락해야 하는데 보관함에 있으면 늦어요.',
      '반대예요. 보관함에 넣었다가 누가 잘못 가져가면 누구 잘못인지 알기 어려워요.',
      '반대해요. 스스로 조절하는 연습이 더 중요한데 보관함은 억지로 못 하게 하는 거예요.',
      '내 생각에는 반대예요. 필요할 때 검색해서 공부하는 친구도 있잖아요.',
      '반대해요. 억지로 못 하게 하면 몰래 다른 폰을 가져오는 친구가 생길 것 같아요.',
      '나는 반대예요. 보관함을 열고 닫느라 쉬는 시간이 더 짧아질 거예요.',
      '반대해요. 폰을 안 쓰는 친구까지 매일 넣었다 뺐다 하는 건 불편해요.',
      '반대예요. 규칙보다는 반 친구들끼리 약속을 정하는 게 더 오래 갈 것 같아요.',
      '나는 반대해요. 하교 후 학원 갈 때 부모님 연락을 못 받으면 큰일이에요.',
      '반대해요. 보관함이 없어도 우리 반은 수업 시간에 폰을 안 꺼내요.',
    ],
  },
  {
    bankId: 3, // 초등학생에게 유튜브 시청 시간 제한이 필요할까?
    agree: [
      '찬성해요. 시간을 정해 두면 숙제를 먼저 끝내고 보게 돼서 좋아요.',
      '나는 찬성이에요. 자동 재생 때문에 한 시간이 금방 가는데 제한이 있으면 멈출 수 있어요.',
      '찬성해요. 저는 하루 40분으로 정했더니 잠을 일찍 자게 됐어요.',
      '내 생각에는 찬성이에요. 어른도 조절이 어려운데 우리는 더 어렵잖아요.',
      '찬성이에요. 제한이 있어야 다른 취미를 할 시간이 생겨요.',
      '찬성해요. 대신 제한 시간은 부모님과 같이 정하면 좋겠어요.',
      '나는 찬성해요. 유튜브 오래 보면 눈이 아프고 머리도 멍해져요.',
      '찬성이에요. 시청 시간이 화면에 보이면 스스로 놀라서 줄이게 돼요.',
      '찬성해요. 주말에는 조금 길게, 평일에는 짧게 정하면 억울하지 않아요.',
      '찬성이에요. 제한이 있으니까 보고 싶은 영상만 골라서 보게 됐어요.',
      '나는 찬성해요. 제한 없이 보다가 숙제를 못 한 적이 여러 번 있어요.',
      '찬성해요. 유튜브 대신 책이나 운동을 할 시간이 생기는 게 더 좋아요.',
    ],
    disagree: [
      '반대해요. 유튜브로 공부하는 영상도 보는데 시간 제한이 있으면 그것까지 막혀요.',
      '나는 반대예요. 억지로 제한하면 제한이 풀리자마자 더 많이 보게 될 것 같아요.',
      '반대해요. 얼마나 볼지는 스스로 정하고 지키는 연습을 하는 게 낫다고 생각해요.',
      '내 생각에는 반대예요. 사람마다 필요한 시간이 다른데 똑같이 제한하는 건 이상해요.',
      '반대예요. 제한 시간이 되면 보던 영상을 중간에 끊어야 해서 더 아쉬워요.',
      '반대해요. 시간보다는 어떤 영상을 보는지가 더 중요하다고 생각해요.',
      '나는 반대해요. 부모님과 이야기해서 정하는 거지 규칙으로 막을 일은 아니에요.',
      '반대예요. 제한 앱은 우회하는 방법이 많아서 별로 소용이 없어요.',
      '반대해요. 대신 자기 전에는 안 본다처럼 시간대만 정하는 게 좋겠어요.',
      '반대예요. 유튜브에서 만들기 영상 보고 따라 만드는 게 제 취미인데요.',
    ],
  },
  {
    bankId: 16, // 내가 폰을 가장 많이 쓰는 시간은 언제일까?
    open: [
      '저는 학원 끝나고 집에 오는 버스 안이에요. 심심해서 쇼츠를 계속 넘기게 돼요.',
      '자기 전 침대에서요. 잠깐만 보려다가 30분이 넘어가요.',
      '저녁 먹고 나서 숙제하기 전이 제일 길어요. 미루고 싶어서 폰을 잡게 돼요.',
      '주말 아침이요. 일어나자마자 폰부터 봐서 오전이 다 가요.',
      '학교 끝나고 집에 가면 아무도 없어서 폰으로 시간을 보내요.',
      '단톡방 알림이 오는 저녁 8시쯤이 제일 많아요. 답장하다 보면 계속 보게 돼요.',
      '저는 밥 먹을 때요. 부모님이 늦게 오시는 날은 폰 보면서 먹어요.',
      '학원 쉬는 시간 10분씩 모으면 하루에 한 시간이 넘더라고요.',
      '엄마가 설거지하시는 동안이요. 그때 게임 한 판 하고 싶어져요.',
      '토요일 오후요. 친구들이 다 게임에 접속해서 같이 하게 돼요.',
      '숙제 끝나고 보상처럼 보는 시간이 제일 길어요. 보상이 너무 커지는 게 문제예요.',
      '아침에 등교 준비하면서 날씨 본다고 켰다가 영상까지 보게 돼요.',
      '동생이 자는 밤 10시 이후요. 조용해서 폰이 더 재밌어요.',
      '학교 갔다 와서 낮잠 대신 누워서 폰 보는 시간이 제일 길어요.',
      '차 타고 이동할 때요. 멀미가 안 나서 계속 보게 돼요.',
      '일요일 저녁이요. 내일 학교 가기 싫어서 더 오래 보는 것 같아요.',
      '사용시간 그래프를 보니 오후 9시에서 10시가 제일 높았어요. 놀랐어요.',
      '저는 아침보다 저녁이에요. 특히 웹툰 새 회차 올라오는 날이요.',
      '학원 숙제 검색한다고 켰다가 딴 데로 새는 저녁 7시요.',
      '비 오는 날 밖에 못 나가면 하루 종일 폰을 봐요.',
      '친구랑 통화하면서 게임하는 저녁 시간이 제일 길어요.',
      '방학이면 오전 내내요. 학기 중엔 저녁 9시쯤이에요.',
    ],
  },
  {
    bankId: 2, // 쉬는 시간 10분, 폰 없이 보낼 수 있을까?
    agree: [
      '찬성해요. 10분이면 친구랑 공기놀이 한 판 하기 딱 좋아요.',
      '나는 찬성이에요. 쉬는 시간에 폰 보면 다음 수업 시작할 때 머리가 안 돌아가요.',
      '찬성해요. 우리 반은 쉬는 시간에 보드게임을 하는데 폰 볼 틈이 없어요.',
      '내 생각에는 찬성이에요. 10분은 짧아서 폰을 켜 봤자 별로 못 봐요.',
      '찬성이에요. 쉬는 시간에 물 마시고 화장실 가고 친구랑 이야기하면 끝나요.',
      '찬성해요. 폰 없이 보내니까 친구랑 더 친해졌어요.',
      '나는 찬성해요. 대신 점심시간엔 조금 봐도 된다고 하면 지킬 수 있어요.',
      '찬성이에요. 쉬는 시간에 복도에서 술래잡기하는 게 더 재밌어요.',
      '찬성해요. 폰을 안 보면 눈도 쉬고 몸도 움직이게 돼요.',
      '찬성이에요. 10분 동안 창밖 보면서 멍 때리는 것도 좋아요.',
      '나는 찬성해요. 한 명이 폰을 꺼내면 다 같이 보게 되니까 아예 안 꺼내는 게 나아요.',
      '찬성해요. 쉬는 시간에 다음 수업 준비하면 선생님께 칭찬받아요.',
    ],
    disagree: [
      '반대해요. 쉬는 시간은 쉬는 시간이니까 뭘 할지는 자유여야 해요.',
      '나는 반대예요. 부모님께 하교 시간 문자를 보내야 할 때가 있어요.',
      '반대해요. 10분 동안 좋아하는 노래 한 곡 듣는 게 저한테는 휴식이에요.',
      '내 생각에는 반대예요. 폰을 안 보게 하는 것보다 같이 놀 거리를 만드는 게 먼저예요.',
      '반대예요. 시간표나 준비물 확인을 폰으로 하는 친구도 많아요.',
      '반대해요. 강제로 막으면 몰래 보다가 더 혼나는 일이 생겨요.',
      '나는 반대해요. 하루 종일 참았다가 집에 가서 몰아 보면 똑같아요.',
      '반대예요. 쉬는 시간에 폰으로 사전 찾아보는 것도 공부예요.',
      '반대해요. 친구가 없는 날은 폰이 유일한 쉬는 방법이에요.',
      '반대예요. 규칙보다 스스로 조절하는 걸 배워야 중학교 가서도 지켜요.',
    ],
  },
  {
    bankId: 28, // 잠들기 전 30분, 폰 대신 무엇을 하면 좋을까?
    open: [
      '저는 만화책이 아닌 소설을 읽어요. 열 쪽만 읽어도 잠이 잘 와요.',
      '엄마랑 오늘 있었던 일 이야기하기요. 폰 볼 때보다 훨씬 좋아요.',
      '스트레칭이요. 다리를 쭉 펴고 10분만 해도 아침에 몸이 가벼워요.',
      '내일 준비물 챙기고 옷을 미리 꺼내 두면 아침이 편해요.',
      '동생한테 책 읽어 주기요. 동생이 먼저 잠들어서 저도 따라 자요.',
      '일기 쓰기요. 오늘 좋았던 일 세 가지를 적으면 기분 좋게 잠들어요.',
      '저는 그림을 그려요. 색칠하다 보면 눈이 편해져요.',
      '음악을 작게 틀어 놓고 눈 감고 듣는 거요. 폰 화면은 안 봐요.',
      '가족이랑 보드게임 한 판이요. 짧은 게임으로 하면 30분에 딱 맞아요.',
      '내일 할 일을 종이에 적어요. 그러면 머릿속이 정리돼서 잠이 와요.',
      '창문 열고 별 보기요. 시골 할머니 댁에서 배운 방법이에요.',
      '따뜻한 우유 마시고 양치하고 바로 눕기요. 단순한 게 제일 좋아요.',
      '레고 조립이요. 폰보다 훨씬 집중되고 시간이 빨리 가요.',
      '강아지 산책 잠깐 다녀오기요. 강아지도 좋아하고 저도 잠이 잘 와요.',
      '퍼즐 맞추기요. 매일 조금씩 하면 일주일에 하나 완성돼요.',
      '뜨개질을 배우고 있어요. 손을 움직이면 폰 생각이 안 나요.',
      '오늘 배운 거 한 번 훑어보기요. 시험 기간엔 특히 도움이 돼요.',
      '누워서 내일 먹고 싶은 급식 상상하기요. 웃기지만 금방 잠들어요.',
      '가족이랑 같이 방 정리하기요. 깨끗한 방에서 자면 기분이 좋아요.',
      '종이접기요. 학을 백 마리 접는 게 요즘 목표예요.',
      '아무것도 안 하고 그냥 눕기요. 처음엔 심심한데 익숙해지면 제일 좋아요.',
      '내일 입을 옷 골라 두고 알람 맞추기요. 폰은 그때 딱 한 번만 만져요.',
    ],
  },
  {
    bankId: 7, // 초등학생도 SNS 계정을 만들어도 될까?
    agree: [
      '찬성해요. 멀리 이사 간 친구랑 연락할 수 있는 방법이에요.',
      '나는 찬성이에요. 부모님이 같이 보는 조건이면 괜찮다고 생각해요.',
      '찬성해요. 그림이나 만든 작품을 올려서 칭찬받으면 더 열심히 하게 돼요.',
      '내 생각에는 찬성이에요. 어차피 중학교 가면 다 하는데 미리 안전하게 배우는 게 나아요.',
      '찬성이에요. 학교 소식이나 동아리 활동을 공유할 수 있어요.',
      '찬성해요. 대신 모르는 사람 친구 추가는 안 하기로 약속하면 돼요.',
      '나는 찬성해요. 사촌들이랑 사진 나누는 게 제일 재밌어요.',
      '찬성이에요. 나이 제한을 지키면서 가족 계정으로 하면 문제없어요.',
      '찬성해요. 좋은 정보를 찾는 방법도 배울 수 있어요.',
      '찬성이에요. 하루 20분처럼 시간을 정하면 리포트처럼 관리할 수 있어요.',
      '나는 찬성해요. 댓글 예절을 어릴 때부터 배우는 게 좋아요.',
      '찬성해요. 우리 반 SNS를 만들어서 학급 소식을 올리면 좋겠어요.',
    ],
    disagree: [
      '반대해요. 모르는 사람이 말을 걸어올 수 있어서 위험해요.',
      '나는 반대예요. 친구 게시물 보다 보면 시간이 너무 빨리 가요.',
      '반대해요. 좋아요 수 때문에 기분이 왔다 갔다 하는 친구를 봤어요.',
      '내 생각에는 반대예요. 사진을 올리면 지우고 싶어도 완전히 안 지워진대요.',
      '반대예요. 나이 제한이 있는 건 이유가 있어서라고 생각해요.',
      '반대해요. 지금은 직접 만나서 노는 게 더 재밌어요.',
      '나는 반대해요. 친구가 SNS에서 놀림을 당한 적이 있어요.',
      '반대예요. 광고랑 이상한 영상이 너무 많이 떠요.',
      '반대해요. 부모님이 다 보는 계정이면 어차피 재미도 없어요.',
      '반대예요. 중학생 되고 나서 만들어도 늦지 않아요.',
    ],
  },
  {
    bankId: 9, // (진행 중) 게임 시간은 부모님이 정해야 할까, 내가 정해야 할까?
    agree: [
      '찬성해요. 부모님이 정하면 싸울 일이 없고 마음이 편해요.',
      '나는 찬성이에요. 제가 정하면 자꾸 늘리게 돼서 부모님이 정하는 게 나아요.',
      '찬성해요. 대신 왜 그 시간인지 설명해 주시면 지킬 수 있어요.',
      '내 생각에는 찬성이에요. 아직은 스스로 멈추기가 어려워요.',
      '찬성이에요. 부모님이 정한 시간 안에서 게임하면 더 집중해서 재밌어요.',
      '찬성해요. 시험 기간처럼 상황에 맞게 부모님이 조절해 주시면 좋아요.',
      '나는 찬성해요. 부모님이 정한 규칙을 잘 지키면 주말에 보너스 시간을 받아요.',
      '찬성이에요. 규칙이 있어야 게임 끝나고 다른 것도 할 수 있어요.',
      '찬성해요. 어른이 정한 시간이 있으니까 친구들 앞에서도 그만할 핑계가 돼요.',
      '찬성이에요. 제가 정하면 하루 세 시간이라고 할 것 같아요.',
      '나는 찬성해요. 부모님과 정한 시간을 지키면 서로 믿음이 생겨요.',
      '찬성해요. 나중에 잘 지키면 그때 제가 정하게 해 주신대요.',
    ],
    disagree: [
      '반대해요. 제가 정해야 지키려는 마음이 생겨요. 시킨 건 잘 안 지켜져요.',
      '나는 반대예요. 부모님이 정하면 몰래 더 하고 싶어져요.',
      '반대해요. 스스로 정하고 어겨 보면서 배우는 게 진짜 연습이에요.',
      '내 생각에는 반대예요. 대신 정한 시간을 종이에 써서 붙이면 지킬 수 있어요.',
      '반대예요. 게임마다 한 판 길이가 달라서 제가 정하는 게 맞아요.',
      '반대해요. 부모님과 같이 의논해서 정하는 게 제일 좋은 방법이에요.',
      '나는 반대해요. 숙제를 다 하면 얼마나 할지는 제가 책임지고 싶어요.',
      '반대예요. 제가 정한 시간을 지켰을 때 더 뿌듯했어요.',
      '반대해요. 부모님이 정하면 매일 시간이 달라져서 헷갈려요.',
      '반대예요. 스스로 타이머를 맞추고 끄는 연습을 하고 있어요.',
    ],
  },
];
const ARTICLES = [
  {
    title: '토요 스포츠데이 배구 결승전, 끝까지 포기하지 않았다',
    type: 'coverage',
    tags: ['S', 'A'],
    oneLine: '다음에도 꼭 참가하고 싶다',
    body: '지난 토요일 운동장에서 스포츠데이 배구 결승전이 열렸다. 6학년 3반과 6학년 5반이 맞붙었고, 학생들이 직접 심판과 기록을 맡았다. 서브가 넘어갈 때마다 응원 소리가 커졌고 마지막 세트는 듀스까지 갔다. 결국 5반이 이겼지만 3반도 끝까지 포기하지 않아서 모두 박수를 받았다. 다음 스포츠데이에는 피구 경기도 열린다고 한다. 체육 선생님은 "규칙을 지키며 즐기는 모습이 가장 좋았다"고 말씀하셨다. 경기가 끝난 뒤에는 양 팀이 악수를 하고 함께 사진을 찍었다.',
  },
  {
    title: '달빛 도서관에 다녀온 사서 선생님 인터뷰',
    type: 'interview',
    tags: ['R'],
    oneLine: '책 읽는 밤이 이렇게 재밌을 줄 몰랐어요',
    body: '사서 선생님께 달빛 도서관 행사에 대해 여쭤보았다. 달빛 도서관은 저녁에 도서관 불을 은은하게 켜고 책을 읽는 행사다. 선생님은 "폰 대신 책과 친해지는 시간을 만들고 싶었다"고 하셨다. 참가한 친구들은 손전등으로 책을 읽는 게 신기했다고 말했다. 다음 달에는 다른 학년도 참가할 수 있다고 한다. 신청은 도서관 앞 게시판에서 할 수 있다. 책을 좋아하는 친구들에게 꼭 추천하고 싶다. 선생님은 마지막으로 "한 권을 끝까지 읽는 경험이 중요하다"고 덧붙이셨다.',
  },
  {
    title: '폰 없는 하루 챌린지 후기',
    type: 'review',
    tags: ['phonefree'],
    oneLine: '손이 심심하면 공기놀이가 최고',
    body: '우리 반은 지난주 수요일에 폰 없는 하루 챌린지를 했다. 아침에 폰을 담임 선생님께 맡기고 하루를 보냈다. 처음에는 손이 심심했는데 점심시간에 친구들이랑 공기놀이를 하니까 시간이 금방 갔다. 집에 가서도 폰을 안 보고 그림을 그렸다. 저녁에 엄마가 "오늘 표정이 밝다"고 하셨다. 다음에는 이틀 연속으로 도전해 보고 싶다. 친구들도 꼭 한번 해 보면 좋겠다. 반 친구 스물 몇 명이 다 같이 하니까 혼자 할 때보다 훨씬 쉬웠다.',
  },
  {
    title: '미술실에서 만난 우리 학교 벽화 이야기',
    type: 'coverage',
    tags: ['A'],
    oneLine: '우리가 그린 그림이 학교에 남는다',
    body: '3층 복도에 새 벽화가 생겼다. 미술부 친구들이 3주 동안 방과 후에 그린 것이다. 주제는 "폰을 내려놓고 바라본 우리 동네"다. 벽화에는 놀이터, 도서관, 강가에서 노는 아이들이 그려져 있다. 미술부 부장은 "친구들이 지나가다 멈춰서 보는 게 제일 기쁘다"고 말했다. 미술 선생님은 다음 벽화 주제를 학생들이 투표로 정하게 하겠다고 하셨다. 벽화 앞에서 사진을 찍는 친구들이 많아졌다.',
  },
  {
    title: '독서 동아리 "책벌레" 회장을 만나다',
    type: 'interview',
    tags: ['R'],
    oneLine: '한 달에 두 권이면 충분해요',
    body: '독서 동아리 책벌레 회장 친구를 인터뷰했다. 책벌레는 매주 금요일 점심시간에 도서관에서 모여 읽은 책을 소개한다. 회장은 "처음엔 책이 지루했는데 친구가 추천한 만화책부터 시작했다"고 했다. 지금은 한 달에 두 권씩 읽는다. 폰 보는 시간이 줄었냐고 묻자 "책 읽다 보면 폰 생각이 안 난다"고 답했다. 동아리는 새 회원을 언제든 받는다. 도서관 앞에 신청서가 있다.',
  },
  {
    title: '점심시간 운동장 축구 리그 개막',
    type: 'coverage',
    tags: ['S'],
    oneLine: '반 대항전이 제일 재밌다',
    body: '이번 주부터 점심시간 반 대항 축구 리그가 시작됐다. 6학년 여덟 반이 두 조로 나뉘어 경기한다. 첫 경기는 1반과 4반이었는데 2대 2로 비겼다. 골키퍼를 맡은 친구는 "공이 무서웠는데 막고 나니까 자신감이 생겼다"고 말했다. 체육 선생님은 심판을 학생이 맡게 해서 규칙을 스스로 배우게 했다. 경기가 있는 날에는 운동장에 폰을 들고 나오는 친구가 거의 없었다. 리그는 10월까지 이어진다.',
  },
  {
    title: '하루 30분 줄이기, 우리 반 2주 도전기',
    type: 'review',
    tags: ['phonefree'],
    oneLine: '같이 하니까 되더라',
    body: '우리 반은 2주 동안 하루 사용시간 30분 줄이기를 함께 했다. 매일 아침 칠판에 어제 사용시간을 적었다. 첫 주에는 절반만 성공했는데 둘째 주에는 스무 명 넘게 성공했다. 제일 많이 줄인 친구는 하루 두 시간을 줄였다. 비결은 알림 끄기와 자기 전 폰 거실에 두기였다. 담임 선생님은 "숫자를 보니까 스스로 조절하게 된다"고 하셨다. 다음에는 3주 도전을 하기로 했다.',
  },
  {
    title: '가을 음악회 준비 현장',
    type: 'coverage',
    tags: ['A'],
    oneLine: '리코더 소리가 이렇게 예쁠 줄이야',
    body: '10월 가을 음악회를 앞두고 음악실이 바빠졌다. 6학년은 리코더 합주와 합창을 준비한다. 연습은 매주 화요일과 목요일 방과 후에 한다. 지휘를 맡은 친구는 "박자가 안 맞을 때가 제일 어렵다"고 했다. 음악 선생님은 폰을 보며 연습하는 대신 서로 소리를 들으라고 하셨다. 연습이 끝나면 간식을 나눠 먹는다. 음악회는 10월 셋째 주 금요일 강당에서 열린다.',
  },
  {
    title: '폰 대신 보드게임, 쉬는 시간이 달라졌다',
    type: 'review',
    tags: ['phonefree', 'A'],
    oneLine: '루미큐브 고수가 되고 싶다',
    body: '자치회에서 교실마다 보드게임을 나눠 준 뒤 쉬는 시간이 달라졌다. 우리 반에서는 루미큐브와 할리갈리가 제일 인기다. 전에는 쉬는 시간에 자리에서 폰을 보는 친구가 많았는데 지금은 책상을 붙여 놓고 게임을 한다. 게임에서 지면 아쉽지만 다음 판이 더 기다려진다. 한 친구는 "폰 게임보다 친구 얼굴 보면서 하는 게 재밌다"고 했다. 자치회는 다음 달에 새 게임을 더 준다고 한다.',
  },
  {
    title: '우리 학교 텃밭 수확의 날',
    type: 'coverage',
    tags: ['R', 'A'],
    oneLine: '고구마가 이렇게 크다니',
    body: '학교 텃밭에서 고구마와 배추를 수확했다. 봄에 심은 고구마가 어른 주먹만큼 자랐다. 6학년은 반별로 고랑을 맡아 캤다. 흙이 묻어도 아무도 폰을 꺼내지 않고 열심히 캤다. 수확한 고구마는 급식실에서 쪄서 나눠 먹었다. 텃밭 담당 선생님은 "기다림의 맛"이라고 하셨다. 배추는 11월 김장에 쓸 예정이다. 다음 주에는 텃밭 일기를 쓰는 시간이 있다.',
  },
  {
    title: '한 장으로 보는 폰프리 3원칙',
    type: 'cardnews',
    tags: ['phonefree'],
    oneLine: '자기 전엔 거실에!',
    body: '첫째, 자기 전에는 폰을 거실에 둔다. 둘째, 공부할 때는 방해금지 모드를 켠다. 셋째, 자동 재생은 끈다. 이 세 가지만 지켜도 하루 한 시간이 생긴다.',
  },
  {
    title: '미술관 견학, 그림 앞에서 멈춰 선 시간',
    type: 'review',
    tags: ['A'],
    oneLine: '사진 대신 눈으로 담았다',
    body: '지난주 목요일 시립미술관에 견학을 갔다. 선생님은 사진을 찍기 전에 그림을 1분 동안 보라고 하셨다. 처음엔 길게 느껴졌는데 자세히 보니 그림 속에 숨은 고양이가 보였다. 폰으로 찍기만 했으면 못 봤을 것이다. 제일 기억에 남는 작품은 바다를 그린 큰 그림이었다. 견학 뒤에는 각자 좋아하는 그림을 따라 그렸다. 다음에는 가족과 다시 가고 싶다.',
  },
] as const;
const REVIEW_OK = { captures_match: true, body_length: true, goal_present: true, clean: true };
const BONUS_REASONS = [
  '목표를 지키려고 노력했어요',
  '친구 글에 따뜻한 댓글을 남겼어요',
  '토론에서 근거를 들어 의견을 말했어요',
  '폰프리 챌린지를 친구들에게 잘 알렸어요',
  '기사를 꼼꼼하게 취재했어요',
];

// ---------- 이미지 ----------
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
type Processed = Awaited<ReturnType<typeof processCapture>>;
const captureCache: { category: Processed[]; app: Processed[] } = { category: [], app: [] };
async function prepareCaptures(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    captureCache.category.push(await processCapture(await fakeCapture('category', i)));
    captureCache.app.push(await processCapture(await fakeCapture('app', i + 7)));
  }
}
async function photo(i: number): Promise<{ buffer: Buffer; size: number }> {
  const colors = ['#88aa44', '#4488aa', '#aa6644', '#aa4488', '#44aa88', '#8844aa'];
  const buffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: colors[i % colors.length] ?? '#88aa44',
    },
  })
    .jpeg()
    .toBuffer();
  return { buffer, size: buffer.length };
}

// ---------- 사용자 ----------
async function userByLogin(loginId: string): Promise<AuthUser> {
  const row = await queryOne<{ id: number }>('SELECT id FROM users WHERE login_id = ?', [loginId]);
  const u = row && (await loadAuthUser(row.id));
  if (!u) throw new Error(`계정 없음: ${loginId}`);
  return u;
}
async function userById(id: number): Promise<AuthUser> {
  const u = await loadAuthUser(id);
  if (!u) throw new Error(`계정 없음: ${id}`);
  return u;
}

type Level = 'high' | 'mid' | 'low';
interface Persona {
  u: AuthUser;
  level: Level;
  /** 주간 평균 사용시간 시작값(분)·주당 변화(음수면 감소) */
  minutes: number;
  trend: number;
  submitP: number;
  commentsPerWeek: [number, number];
  likesPerWeek: [number, number];
  readsPerWeek: [number, number];
  attendPerWeek: [number, number];
  debateP: number;
  perfectAttendance: boolean;
}
function makePersona(u: AuthUser, idx: number): Persona {
  const roll = R();
  const level: Level = roll < 0.25 ? 'high' : roll < 0.75 ? 'mid' : 'low';
  const base =
    level === 'high'
      ? { submitP: 0.95, c: [3, 5], l: [6, 10], r: [4, 8], a: [6, 7], d: 0.9, trend: -12 }
      : level === 'mid'
        ? { submitP: 0.75, c: [1, 2], l: [3, 5], r: [2, 4], a: [4, 5], d: 0.6, trend: -4 }
        : { submitP: 0.4, c: [0, 1], l: [0, 2], r: [0, 2], a: [1, 3], d: 0.25, trend: 3 };
  return {
    u,
    level,
    minutes: between(90, 240),
    trend: base.trend + between(-4, 4),
    submitP: base.submitP,
    commentsPerWeek: base.c as [number, number],
    likesPerWeek: base.l as [number, number],
    readsPerWeek: base.r as [number, number],
    attendPerWeek: base.a as [number, number],
    debateP: base.d,
    perfectAttendance: level === 'high' && idx % 5 === 0,
  };
}

// ---------- 활동 삽입 도우미 (과거 시각 지정) ----------
async function insertReportPost(
  p: Persona,
  wk: string,
  weekIdx: number,
  submit: boolean,
): Promise<number> {
  const u = p.u;
  const consent = u.row.parent_consent === 'Y';
  const prev = await postRepo.findPrevWeekReport(u.row.id, previousWeekKey(wk));
  const avg = consent
    ? Math.max(30, Math.round(p.minutes + p.trend * weekIdx + between(-15, 15)))
    : null;
  const achieved = prev ? chance(0.6) : null;
  const postId = await tx(async (conn) => {
    const id = await postRepo.insertPost(
      {
        type: consent ? 'report' : 'diary',
        authorId: u.row.id,
        classId: u.klass?.id as number,
        grade: u.klass?.grade as number,
        status: submit ? 'pending' : 'draft',
        visibility: chance(0.55) ? 'school' : 'class',
        title: null,
        body: consent ? pickR(BODIES) : pickR(DIARIES),
        goalText: pickR(GOALS),
        weekKey: wk,
        submitted: submit,
      },
      conn,
    );
    await postRepo.upsertReportDetails(
      id,
      {
        avgMinutesPerDay: avg,
        topCategory: consent ? pickR(CATS) : null,
        topApp: consent ? pickR(APPS) : null,
        prevAvgMinutes: prev?.avg_minutes_per_day ?? null,
        diffMinutes: diffMinutes(avg, prev?.avg_minutes_per_day ?? null),
        goalAchieved: achieved,
        goalReason:
          achieved === null ? null : achieved ? pickR(GOAL_REASONS_OK) : pickR(GOAL_REASONS_NO),
      },
      conn,
    );
    return id;
  });
  if (consent) {
    const c = pickR(captureCache.category);
    const a = pickR(captureCache.app);
    await postRepo.insertImage(
      postId,
      'category_capture',
      await saveImage(c),
      c.width,
      c.height,
      0,
    );
    await postRepo.insertImage(postId, 'app_capture', await saveImage(a), a.width, a.height, 1);
  }
  return postId;
}

async function setPostTimes(
  postId: number,
  created: string,
  submitted: string | null,
  approved: string | null,
): Promise<void> {
  await execute(
    'UPDATE posts SET created_at = ?, submitted_at = ?, approved_at = ?, updated_at = ? WHERE id = ?',
    [created, submitted, approved, approved ?? submitted ?? created, postId],
  );
}

async function backdateReviewLogs(postId: number, at: string): Promise<void> {
  await execute('UPDATE review_logs SET created_at = ? WHERE post_id = ?', [at, postId]);
}

async function comment(
  u: AuthUser,
  targetType: 'post' | 'news_topic' | 'council_post',
  targetId: number,
  body: string,
  at: ReturnType<typeof kst>,
  rule: 'COMMENT_WRITTEN' | 'NEWS_OPINION' | null,
): Promise<number> {
  const id = await commentRepo.insertComment(targetType, targetId, u.row.id, body);
  if (targetType === 'post') await postRepo.bumpCommentCount(targetId, 1);
  else if (targetType === 'news_topic') await newsRepo.bumpTopicComments(targetId, 1);
  else await councilRepo.bumpComments(targetId, 1);
  await execute('UPDATE comments SET created_at = ?, updated_at = ? WHERE id = ?', [
    db(at),
    db(at),
    id,
  ]);
  if (rule)
    await applyPointsSafe({
      ruleCode: rule,
      userId: u.row.id,
      refType: 'comment',
      refId: id,
      occurredAt: at.toDate(),
      eventKey: buildEventKey(rule, 'comment', id),
    });
  return id;
}

async function like(
  u: AuthUser,
  targetType: 'post' | 'comment',
  targetId: number,
  ownerId: number,
  at: ReturnType<typeof kst>,
  points = true,
): Promise<void> {
  if (await likeRepo.findLike(u.row.id, targetType, targetId)) return;
  const likeId = await likeRepo.insertLike(u.row.id, targetType, targetId);
  if (targetType === 'post') await likeRepo.bumpPostLikes(targetId, 1);
  else await commentRepo.bumpCommentLikes(targetId, 1);
  await execute('UPDATE likes SET created_at = ? WHERE id = ?', [db(at), likeId]);
  if (!points || ownerId === u.row.id) return;
  await applyPointsSafe({
    ruleCode: 'LIKE_GIVEN',
    userId: u.row.id,
    refType: 'like',
    refId: likeId,
    occurredAt: at.toDate(),
    eventKey: buildEventKey('LIKE_GIVEN', 'like', likeId),
  });
  const received = targetType === 'post' ? 'LIKE_RECEIVED_POST' : 'LIKE_RECEIVED_COMMENT';
  await applyPointsSafe({
    ruleCode: received,
    userId: ownerId,
    refType: 'like',
    refId: likeId,
    capObject: { type: targetType, id: targetId },
    occurredAt: at.toDate(),
    eventKey: buildEventKey(received, 'like', likeId),
  });
}

async function read(
  u: AuthUser,
  type: 'post' | 'news_topic',
  id: number,
  at: ReturnType<typeof kst>,
): Promise<void> {
  const r = await execute(
    'INSERT IGNORE INTO post_reads (user_id, target_type, target_id, opened_at, completed_at) VALUES (?, ?, ?, ?, ?)',
    [u.row.id, type, id, db(at), db(at.add(40, 'second'))],
  );
  if (r.affectedRows === 0) return;
  await applyPointsSafe({
    ruleCode: 'POST_READ',
    userId: u.row.id,
    refType: type,
    refId: id,
    occurredAt: at.toDate(),
    eventKey: `${buildEventKey('POST_READ', type, id)}:${u.row.id}`,
  });
}

// ---------- 메인 ----------
async function main(): Promise<void> {
  if (isProd)
    throw new Error(
      'production 환경에서는 더미 데이터를 넣을 수 없습니다. (NODE_ENV=development 로 실행)',
    );
  const existing = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM posts');
  if (Number(existing?.n ?? 0) > 0)
    throw new Error(
      '이미 글이 있습니다. `npm run db:seed -- --force` 로 기본 시드부터 다시 넣은 뒤 실행하세요.',
    );
  console.log(
    `기간: ${WEEKS[0]} ~ ${WEEKS[WEEKS.length - 1]} + 이번 주 ${CUR}, 지난달 ${LAST_MONTH}`,
  );
  await prepareCaptures();

  const admin = await userByLogin('admin@ches.es.kr');
  const classes = await query<{ id: number; name: string; homeroom_teacher_id: number | null }>(
    'SELECT id, name, homeroom_teacher_id FROM classes ORDER BY class_no',
  );
  const homeroom: Record<number, AuthUser> = {};
  for (const c of classes)
    if (c.homeroom_teacher_id) homeroom[c.id] = await userById(c.homeroom_teacher_id);
  const teacherOf = (u: AuthUser) => (u.row.class_id && homeroom[u.row.class_id]) || admin;
  const studentRows = await query<{ id: number }>(
    "SELECT u.id FROM users u JOIN classes c ON c.id = u.class_id WHERE u.role = 'student' AND u.status = 'active' ORDER BY c.class_no, u.student_no",
  );
  const personas: Persona[] = [];
  for (const [i, s] of studentRows.entries()) personas.push(makePersona(await userById(s.id), i));
  const councilIds = (
    await query<{ user_id: number }>('SELECT user_id FROM council_members WHERE is_active = 1')
  ).map((r) => r.user_id);
  const councilUsers = await Promise.all(councilIds.map(userById));
  const reviewerFor = (u: AuthUser) =>
    councilUsers.find((c) => c.row.class_id !== u.row.class_id) ?? councilUsers[0];
  console.log(
    `학생 ${personas.length}명 (열심 ${personas.filter((p) => p.level === 'high').length} · 보통 ${personas.filter((p) => p.level === 'mid').length} · 가끔 ${personas.filter((p) => p.level === 'low').length}), 임원 ${councilUsers.length}명`,
  );

  // 반 승인 설정 하나는 교사 단독
  const lastClass = classes[classes.length - 1];
  if (lastClass)
    await saveApprovalSetting(
      { id: admin.row.id },
      {
        scope: 'class',
        scopeId: lastClass.id,
        mode: 'teacher_only',
        autoEscalateHours: 48,
        autoApproveTeacherReview: false,
      },
    );

  // 1) 출석 (지난 6주 + 이번 주): 페르소나별 주당 일수, 개근 학생은 연속 30일+
  const allDays: string[] = [];
  for (
    let d = weekRange(WEEKS[0] as string).start;
    d.isBefore(today.add(1, 'day'), 'day');
    d = d.add(1, 'day')
  )
    allDays.push(d.format('YYYY-MM-DD'));
  let attendanceRows = 0;
  for (const p of personas) {
    const days = new Set<string>();
    if (p.perfectAttendance) allDays.forEach((d) => days.add(d));
    else {
      for (const wk of [...WEEKS, CUR]) {
        const n = between(p.attendPerWeek[0], p.attendPerWeek[1]);
        const candidates = shuffle(allDays.filter((d) => weekKey(d) === wk));
        candidates.slice(0, n).forEach((d) => days.add(d));
      }
    }
    const sorted = [...days].sort();
    let streak = 0;
    let prevDay: string | null = null;
    for (const d of sorted) {
      streak = prevDay && kst(d).diff(kst(prevDay), 'day') === 1 ? streak + 1 : 1;
      prevDay = d;
      const seenAt = kst(d).hour(between(7, 21)).minute(between(0, 59));
      const r = await execute(
        'INSERT IGNORE INTO login_days (user_id, day_key, first_seen_at) VALUES (?, ?, ?)',
        [p.u.row.id, d, db(seenAt)],
      );
      attendanceRows += r.affectedRows;
      await applyPointsSafe({
        ruleCode: 'DAILY_LOGIN',
        userId: p.u.row.id,
        refType: 'login_day',
        refId: Number(d.replace(/-/g, '')),
        occurredAt: seenAt.toDate(),
        eventKey: `DAILY_LOGIN:${p.u.row.id}:${d}`,
      });
      if (isStreakBonusDay(streak))
        await applyPointsSafe({
          ruleCode: 'STREAK_7',
          userId: p.u.row.id,
          refType: 'login_day',
          refId: Number(d.replace(/-/g, '')),
          occurredAt: seenAt.toDate(),
          eventKey: `STREAK_7:${p.u.row.id}:${streakBlockKey(d, streak)}`,
          note: `${streak}일 연속 출석`,
        });
    }
  }
  console.log(`출석 ${attendanceRows}일`);

  // 2) 주차별 리포트: 제출 → 임원 1차 검토(다른 반) → 담임 승인 (일부 반려→재제출, 일부 미제출)
  const approvedByWeek = new Map<
    string,
    Array<{ id: number; authorId: number; classId: number; visibility: string }>
  >();
  let reportCount = 0;
  let rejectedCount = 0;
  for (const [wi, wk] of WEEKS.entries()) {
    const list: Array<{ id: number; authorId: number; classId: number; visibility: string }> = [];
    for (const p of personas) {
      if (!chance(p.submitP)) continue;
      const submittedAt = wkAt(wk, between(4, 6), between(17, 21), between(0, 59));
      const reviewedAt = submittedAt.add(between(2, 20), 'hour');
      const approvedAt = wkAt(wk, 7, between(8, 11), between(0, 59)); // 다음 주 월요일 오전
      const postId = await insertReportPost(p, wk, wi, true);
      reportCount += 1;
      const teacher = teacherOf(p.u);
      const reviewer = reviewerFor(p.u);
      const teacherOnly = p.u.row.class_id === lastClass?.id;
      if (!teacherOnly && reviewer && reviewer.row.id !== p.u.row.id) {
        await transition(postId, 'review_pass', reviewer, { checklist: REVIEW_OK });
        await applyPointsSafe({
          ruleCode: 'REVIEW_DONE',
          userId: reviewer.row.id,
          refType: 'review',
          refId: postId,
          occurredAt: reviewedAt.toDate(),
          eventKey: `${buildEventKey('REVIEW_DONE', 'review', postId)}:${reviewer.row.id}`,
        });
        await backdateReviewLogs(postId, db(reviewedAt));
      }
      if (chance(0.06)) {
        // 반려 → 고쳐서 재제출 → 승인
        await transition(postId, 'reject', teacher, {
          reasonCode: pickR(REJECT_CODES),
          reasonText: '성찰 글을 조금 더 자세히 써 주세요.',
        });
        await execute('UPDATE posts SET body = CONCAT(body, ?) WHERE id = ?', [
          ' 선생님 말씀대로 어떤 앱을 얼마나 썼는지 더 자세히 적어 봤다. 다음 주에는 알림을 끄고 사용시간을 기록해서 비교해 보겠다.',
          postId,
        ]);
        await transition(postId, 'resubmit', p.u);
        rejectedCount += 1;
      }
      await transition(postId, 'approve', teacher);
      await setPostTimes(postId, db(submittedAt), db(submittedAt), db(approvedAt));
      await backdateReviewLogs(postId, db(reviewedAt));
      const row = await postRepo.findPostById(postId);
      list.push({
        id: postId,
        authorId: p.u.row.id,
        classId: p.u.row.class_id as number,
        visibility: row?.visibility ?? 'class',
      });
    }
    approvedByWeek.set(wk, list);
    console.log(`  ${wk}: 리포트 ${list.length}건 승인`);
  }
  // 이번 주: 대기·1차 통과·보류·반려·초안 섞기
  const thisWeek: Array<{ id: number; authorId: number }> = [];
  for (const [i, p] of personas.entries()) {
    if (!chance(p.submitP * 0.7)) continue;
    const submit = i % 11 !== 3;
    const postId = await insertReportPost(p, CUR, WEEKS.length, submit);
    const submittedAt = wkAt(
      CUR,
      Math.min(between(0, 3), today.isoWeekday() - 1),
      between(16, 21),
      between(0, 59),
    );
    await setPostTimes(postId, db(submittedAt), submit ? db(submittedAt) : null, null);
    if (!submit) continue;
    const reviewer = reviewerFor(p.u);
    const teacherOnly = p.u.row.class_id === lastClass?.id;
    if (!teacherOnly && reviewer && i % 3 === 0) {
      await transition(postId, 'review_pass', reviewer, { checklist: REVIEW_OK });
      await backdateReviewLogs(postId, db(submittedAt.add(3, 'hour')));
    } else if (!teacherOnly && reviewer && i % 7 === 5) {
      await transition(postId, 'review_hold', reviewer, {
        checklist: { ...REVIEW_OK, captures_match: false },
        note: '캡처가 안내한 화면과 달라요. 사용시간 화면과 앱 순위 화면을 올려 주세요.',
      });
      await backdateReviewLogs(postId, db(submittedAt.add(3, 'hour')));
    } else if (i % 13 === 6) {
      await transition(postId, 'reject', teacherOf(p.u), { reasonCode: 'too_short' });
    } else if (i % 5 === 1) {
      await transition(postId, 'approve', teacherOf(p.u));
      await setPostTimes(
        postId,
        db(submittedAt),
        db(submittedAt),
        db(submittedAt.add(1, 'day').hour(9)),
      );
    }
    thisWeek.push({ id: postId, authorId: p.u.row.id });
  }
  console.log(
    `리포트 ${reportCount}건(반려 후 재제출 ${rejectedCount}) + 이번 주 ${thisWeek.length}건`,
  );

  // 3) 기사: 기자단 + 일반 학생, 승인 10 · 대기 1 · 반려 1, 추천 3
  const reporters = personas.filter((p) => p.u.row.is_reporter === 1);
  const writers = shuffle([
    ...reporters,
    ...personas.filter((p) => p.u.row.is_reporter !== 1 && p.level !== 'low').slice(0, 5),
  ]).slice(0, ARTICLES.length);
  const articles: Array<{ id: number; authorId: number }> = [];
  for (const [i, w] of writers.entries()) {
    const a = ARTICLES[i] as (typeof ARTICLES)[number];
    const bundle = await createArticle(
      w.u,
      {
        title: a.title,
        tags: [...a.tags],
        articleType: a.type,
        body:
          a.type !== 'cardnews' && Array.from(a.body).length < 200
            ? a.body + ' 다음에도 이런 행사가 또 열리면 꼭 참여하고 싶다.'
            : a.body,
        oneLine: a.oneLine,
        submit: true,
      },
      a.type === 'cardnews' ? [await photo(i)] : [await photo(i), await photo(i + 3)],
    );
    const wk = WEEKS[
      Math.min(WEEKS.length - 1, Math.floor((i * WEEKS.length) / ARTICLES.length))
    ] as string;
    const submittedAt = wkAt(wk, between(1, 5), between(15, 20));
    if (i === ARTICLES.length - 1) {
      await setPostTimes(
        bundle.post.id,
        db(today.subtract(1, 'day').hour(15)),
        db(today.subtract(1, 'day').hour(15)),
        null,
      );
    } else if (i === ARTICLES.length - 2) {
      await transition(bundle.post.id, 'reject', admin, { reasonCode: 'too_short' });
      await setPostTimes(bundle.post.id, db(submittedAt), db(submittedAt), null);
    } else {
      await transition(bundle.post.id, 'approve', admin);
      await setPostTimes(
        bundle.post.id,
        db(submittedAt),
        db(submittedAt),
        db(submittedAt.add(1, 'day').hour(9)),
      );
      articles.push({ id: bundle.post.id, authorId: w.u.row.id });
      if (i < 3)
        await execute('UPDATE article_details SET is_featured = 1 WHERE post_id = ?', [
          bundle.post.id,
        ]);
    }
  }
  console.log(`기사 ${articles.length}건 승인 (+대기 1, 반려 1, 추천 3)`);

  // 4) 댓글·엄지척·읽기: 주차별로 그 주와 앞 주의 승인 글에
  let commentCount = 0;
  let likeCount = 0;
  let readCount = 0;
  const commentIds: Array<{ id: number; authorId: number; at: ReturnType<typeof kst> }> = [];
  const perPostByAuthor = new Map<string, number>();
  for (const [wi, wk] of [...WEEKS, CUR].entries()) {
    const pool = [
      ...(approvedByWeek.get(wk) ?? []),
      ...(approvedByWeek.get(WEEKS[wi - 1] ?? '') ?? []),
      ...articles.map((a) => ({
        id: a.id,
        authorId: a.authorId,
        classId: 0,
        visibility: 'school',
      })),
    ];
    if (pool.length === 0) continue;
    const dayLimit = wk === CUR ? today.isoWeekday() - 1 : 6;
    for (const p of personas) {
      const visible = pool.filter(
        (x) =>
          x.authorId !== p.u.row.id &&
          (x.visibility === 'school' || x.classId === p.u.row.class_id),
      );
      if (visible.length === 0) continue;
      const nC = between(p.commentsPerWeek[0], p.commentsPerWeek[1]);
      const nL = between(p.likesPerWeek[0], p.likesPerWeek[1]);
      const nR = between(p.readsPerWeek[0], p.readsPerWeek[1]);
      for (let k = 0; k < nC; k += 1) {
        const t = pickR(visible);
        const key = `${p.u.row.id}:${t.id}`;
        if ((perPostByAuthor.get(key) ?? 0) >= 3) continue;
        perPostByAuthor.set(key, (perPostByAuthor.get(key) ?? 0) + 1);
        const at = wkAt(wk, between(0, Math.max(0, dayLimit)), between(15, 21), between(0, 59));
        const id = await comment(p.u, 'post', t.id, commentText(p.level), at, 'COMMENT_WRITTEN');
        commentIds.push({ id, authorId: p.u.row.id, at });
        commentCount += 1;
      }
      for (const t of shuffle(visible).slice(0, nL)) {
        await like(
          p.u,
          'post',
          t.id,
          t.authorId,
          wkAt(wk, between(0, Math.max(0, dayLimit)), between(12, 21), between(0, 59)),
        );
        likeCount += 1;
      }
      for (const t of shuffle(visible).slice(0, nR)) {
        await read(
          p.u,
          'post',
          t.id,
          wkAt(wk, between(0, Math.max(0, dayLimit)), between(12, 21), between(0, 59)),
        );
        readCount += 1;
      }
    }
  }
  // 댓글 엄지척
  for (const p of personas.filter((x) => x.level !== 'low')) {
    for (const c of shuffle(commentIds).slice(0, between(1, 4))) {
      if (c.authorId === p.u.row.id) continue;
      await like(p.u, 'comment', c.id, c.authorId, c.at.add(between(1, 30), 'hour'));
    }
  }
  console.log(`댓글 ${commentCount}, 엄지척 ${likeCount}+, 읽기 ${readCount}`);

  // 5) 토론: 지난 6주 매주 수요일 1건(마감·베스트), 이번 주 진행 중 1건, 다음 주 예약
  const bank = await newsAdmin.listBank();
  let debates = 0;
  const weeksForDebate = [...WEEKS, CUR];
  for (const [wi, plan] of TOPIC_PLAN.entries()) {
    const wk = weeksForDebate[wi];
    const b = bank.find((x) => x.id === plan.bankId);
    if (!wk || !b) break;
    if (b.status !== 'ready') await newsAdmin.setBankStatus(admin, b.id, 'ready');
    const publishAt = wkAt(wk, 2, 8);
    const closeAt = publishAt.add(7, 'day');
    const t = await newsAdmin.scheduleFromBank(admin, b.id, publishAt.format('YYYY-MM-DD HH:mm'));
    const live = wk === CUR;
    await execute(
      "UPDATE news_topics SET status = 'live', publish_at = ?, close_at = ? WHERE id = ?",
      [db(publishAt), db(closeAt), t.id],
    );
    const poolAgree = shuffle(plan.agree ?? []);
    const poolDisagree = shuffle(plan.disagree ?? []);
    const poolOpen = shuffle(plan.open ?? []);
    const opinionIds: number[] = [];
    for (const p of shuffle(personas)) {
      if (!chance(p.debateP)) continue;
      const at = publishAt.add(
        between(2, live ? Math.max(2, today.diff(publishAt, 'hour')) : 150),
        'hour',
      );
      if (t.type === 'vote') {
        const side = chance(0.58) ? 'agree' : 'disagree';
        await newsRepo.upsertVote(t.id, p.u.row.id, side);
        await execute('UPDATE news_votes SET created_at = ? WHERE topic_id = ? AND user_id = ?', [
          db(at),
          t.id,
          p.u.row.id,
        ]);
        await applyPointsSafe({
          ruleCode: 'NEWS_VOTE',
          userId: p.u.row.id,
          refType: 'news_topic',
          refId: t.id,
          capObject: { type: 'news_topic', id: t.id },
          occurredAt: at.toDate(),
          eventKey: `NEWS_VOTE:news_topic:${t.id}:u${p.u.row.id}`,
        });
        const pool = side === 'agree' ? poolAgree : poolDisagree;
        if (pool.length > 0 && chance(p.level === 'high' ? 0.75 : 0.4)) {
          const text = pool.pop() as string;
          opinionIds.push(
            await comment(p.u, 'news_topic', t.id, text, at.add(10, 'minute'), 'NEWS_OPINION'),
          );
        }
      } else if (poolOpen.length > 0 && chance(0.65)) {
        const text = poolOpen.pop() as string;
        opinionIds.push(await comment(p.u, 'news_topic', t.id, text, at, 'NEWS_OPINION'));
      }
      if (chance(0.5)) await read(p.u, 'news_topic', t.id, at.subtract(5, 'minute'));
    }
    await newsRepo.recountTopic(t.id);
    if (!live) {
      await execute("UPDATE news_topics SET status = 'closed' WHERE id = ?", [t.id]);
      if (opinionIds.length > 0)
        await selectBest(admin, t.id, shuffle(opinionIds).slice(0, 2)).catch((e: Error) =>
          console.log('  베스트 선정 건너뜀:', e.message),
        );
    }
    debates += 1;
  }
  await runNewsReserve().catch(() => undefined);
  console.log(`토론 ${debates}건 (마감 ${debates - 1} + 진행 중 1) + 다음 주 예약`);

  // 6) 자치회 글: 공지(고정·진행 중), 투표(진행 중), 홍보·활동 보고(지난 글)
  const [co1, co2] = councilUsers;
  if (co1 && co2) {
    const mk = async (
      u: AuthUser,
      input: Parameters<typeof councilPosts.createPost>[1],
      files: Array<{ buffer: Buffer; size: number }>,
      approvedAt: ReturnType<typeof kst>,
      pinned: boolean,
      expired: boolean,
    ) => {
      const v = await councilPosts.createPost(u, input, files);
      await councilAdmin.approve(admin, v.id, { isPinned: pinned });
      await execute(
        'UPDATE council_posts SET created_at = ?, submitted_at = ?, approved_at = ?, updated_at = ? WHERE id = ?',
        [
          db(approvedAt.subtract(1, 'day')),
          db(approvedAt.subtract(1, 'day')),
          db(approvedAt),
          db(approvedAt),
          v.id,
        ],
      );
      if (expired)
        await execute("UPDATE council_posts SET status = 'expired', is_pinned = 0 WHERE id = ?", [
          v.id,
        ]);
      return v.id;
    };
    const notice = await mk(
      co1,
      {
        type: 'notice',
        title: '10월 폰프리 챌린지 같이 해요!',
        body: '📌 무엇을 하나요?\n- 자기 전에 폰을 거실에 두고 자요.\n- 아침에 일어나서 가져가면 성공!\n\n📅 언제?\n- 10월 6일(월) ~ 10월 17일(금), 2주 동안\n- 주말은 쉬어도 돼요.\n\n✅ 어떻게 참여하나요?\n1. 담임 선생님께 "우리 반 참여해요"라고 말해요.\n2. 교실 뒤 게시판 표에 성공한 날 스티커를 붙여요.\n3. 주간 리포트 목표에 "자기 전 폰 거실에 두기"를 적어요.\n\n🎁 다 같이 지키면?\n- 성공한 날이 7일 이상인 친구에게 자치회가 만든 배지 스티커를 드려요.\n- 반 전체 성공률이 80%를 넘으면 그 반은 점심시간 보드게임 우선 대여!\n\n❓ 궁금한 점은 자치회 임원(6-1 회장, 6-2 부회장, 6-5 서기)에게 물어봐 주세요.',
        startsAt: today.subtract(3, 'day').toISOString(),
        endsAt: today.add(12, 'day').toISOString(),
        pinRequested: true,
        allowComments: true,
        pollOptions: [],
        pollShowBeforeClose: false,
        submit: true,
      },
      [await photo(20)],
      today.subtract(3, 'day').hour(10),
      true,
      false,
    );
    const poll = await mk(
      co2,
      {
        type: 'poll',
        title: '가을 축제 6학년 부스, 무엇을 할까요?',
        body: '🎪 10월 가을 축제에서 6학년이 맡을 부스를 정해요.\n\n📋 후보\n- 보드게임 카페: 루미큐브·할리갈리·젠가, 한 판에 스티커 1장\n- 포토존: 가을 배경 + 소품, 폴라로이드 촬영\n- 종이접기 체험: 학·상자·팽이 접기, 완성작 가져가기\n- 폰프리 미니 올림픽: 줄넘기·공기·제기차기 기록 대결\n\n🗳️ 투표 규칙\n- 1인 1표, 한 번 고르면 바꿀 수 없어요.\n- 결과는 투표가 끝난 뒤 공개해요.\n- 마감: 이번 주 일요일 저녁\n\n📣 가장 많은 표를 받은 부스로 정하고, 준비 모임은 다음 주 화요일 점심시간 자치회실에서 해요.',
        startsAt: today.subtract(5, 'day').toISOString(),
        endsAt: today.add(4, 'day').toISOString(),
        pinRequested: true,
        allowComments: true,
        pollOptions: ['보드게임 카페', '포토존', '종이접기 체험', '폰프리 미니 올림픽'],
        pollShowBeforeClose: false,
        submit: true,
      },
      [],
      today.subtract(5, 'day').hour(9),
      true,
      false,
    );
    await mk(
      co1,
      {
        type: 'promo',
        title: '점심시간 보드게임 대여 시작!',
        body: '🎲 자치회에서 반마다 보드게임을 빌려줘요.\n\n📍 어디서?\n- 자치회실(3층 끝 교실)\n\n⏰ 언제?\n- 매일 점심시간 12:40 ~ 13:00 대여, 13:20까지 반납\n\n🎮 빌릴 수 있는 게임\n- 루미큐브, 할리갈리, 젠가, 도블, 우노\n\n📝 방법\n1. 반 대표 한 명이 자치회실로 와요.\n2. 대여장에 반·이름을 적어요.\n3. 쓰고 나서 부품을 세어 반납해요.\n\n⚠️ 부품을 잃어버리면 그 주는 대여를 쉬어요. 쉬는 시간엔 폰 대신 친구들과 놀아요!',
        startsAt: today.subtract(20, 'day').toISOString(),
        endsAt: today.subtract(6, 'day').toISOString(),
        pinRequested: false,
        allowComments: true,
        pollOptions: [],
        pollShowBeforeClose: false,
        submit: true,
      },
      [await photo(21)],
      today.subtract(20, 'day').hour(9),
      false,
      true,
    );
    await mk(
      co2,
      {
        type: 'report',
        title: '9월 자치회 활동 보고',
        body: '📊 9월에 한 일\n- 폰 없는 하루 챌린지 2회 (9월 3일, 9월 17일) — 6학년 180명 참여\n- 점심시간 보드게임 대여 시작 (9월 4일부터) — 하루 평균 6개 반 이용\n- 토론방 주제 제안 3건 (그중 2건 채택)\n\n💬 친구들 의견\n- "쉬는 시간이 더 재밌어졌어요"라는 말을 가장 많이 들었어요.\n- 보드게임 종류를 늘려 달라는 요청이 많았어요.\n\n📅 10월에 할 일\n- 가을 축제 6학년 부스 준비\n- 자기 전 폰 거실에 두기 챌린지 (2주)\n- 새 보드게임 3종 추가\n\n🙏 의견이 있으면 자치회 임원에게 말해 주세요. 다음 회의는 10월 첫째 주 수요일이에요.',
        startsAt: today.subtract(14, 'day').toISOString(),
        endsAt: today.subtract(2, 'day').toISOString(),
        pinRequested: false,
        allowComments: false,
        pollOptions: [],
        pollShowBeforeClose: false,
        submit: true,
      },
      [],
      today.subtract(14, 'day').hour(9),
      false,
      true,
    );
    // 투표·댓글 (포인트 없음)
    const pollView = await councilPosts.getPost(admin, poll);
    const optionIds = pollView.poll?.options.map((o) => o.id) ?? [];
    let votes = 0;
    for (const p of personas) {
      if (optionIds.length === 0 || !chance(0.7)) continue;
      await councilPosts.pollVote(p.u, poll, pickR(optionIds)).catch(() => undefined);
      votes += 1;
    }
    for (const p of shuffle(personas).slice(0, 6)) {
      await comment(
        p.u,
        'council_post',
        notice,
        pickR([
          '좋아요! 우리 반도 참여할게요.',
          '스티커는 어디서 받아요? 궁금해요!',
          '자기 전 폰 거실에 두기 벌써 하고 있어요. 같이 해요!',
        ]),
        today.subtract(between(0, 2), 'day').hour(between(13, 20)),
        null,
      );
    }
    console.log(`자치회 글 4건 (투표 ${votes}표)`);
  }

  // 7) 주간 TOP 스냅샷 + 주간 선물 (최근 3주)
  for (const wk of WEEKS) await runWeeklyTop(wk);
  for (const wk of WEEKS.slice(-3)) {
    const r = await weeklyGifts.grant(admin, wk, { topN: 3 });
    const manual = r.panel.candidates.find((c) => !c.gifted && c.rankInGrade > 3);
    if (manual)
      await weeklyGifts.grant(admin, wk, { userIds: [manual.userId], note: '친구를 잘 도와줘서' });
  }
  console.log('주간 TOP 스냅샷 6주 + 주간 선물 3주');

  // 8) 지난달 결산 확정 (3부문 선정 포함)
  {
    const row = await ensureDraft(LAST_MONTH);
    const view = await settlementView(LAST_MONTH, row);
    const awards: Array<{
      category: 'phonefree' | 'reporter' | 'participation';
      userId: number;
      reason: string;
    }> = [];
    const used = new Set<number>();
    const reason = {
      phonefree: '사용시간을 꾸준히 줄이고 목표를 잘 지켰어요',
      reporter: '학교 이야기를 생생하게 취재했어요',
      participation: '친구 글에 따뜻한 댓글을 가장 많이 남겼어요',
    } as const;
    for (const g of view.grades)
      for (const cat of ['phonefree', 'reporter', 'participation'] as const) {
        const c = g.awards[cat].find((x) => !used.has(x.userId));
        if (c) {
          awards.push({ category: cat, userId: c.userId, reason: reason[cat] });
          used.add(c.userId);
        }
      }
    if (view.status === 'draft') {
      const r = await confirmSettlement(admin, LAST_MONTH, {
        perGradeGiftCount: 5,
        perGradeGrowthCount: 3,
        allowConsecutiveUserIds: [],
        allowConsecutiveClass: false,
        excludeWeeklyGift: false,
        awards,
        note: '첫 달 결산. 모두 수고했어요!',
      });
      console.log(
        `${LAST_MONTH} 결산 확정: 포인트 상위 ${r.granted.monthlyTop}, 부문 ${r.granted.awards}`,
      );
    }
  }

  // 9) 교사 칭찬·공지·신고
  let bonuses = 0;
  for (const c of classes) {
    const t = homeroom[c.id];
    if (!t) continue;
    const kids = personas.filter((p) => p.u.row.class_id === c.id && p.level !== 'low');
    for (const p of shuffle(kids).slice(0, 2)) {
      await teacherBonus(t, p.u.row.id, pickR([5, 10, 15]), pickR(BONUS_REASONS)).catch(
        () => undefined,
      );
      bonuses += 1;
    }
  }
  await createNotice(
    { id: admin.row.id },
    {
      title: '10월 폰프리 챌린지 안내',
      body: '📌 10월 6일(월)부터 2주 동안 "자기 전 폰 거실에 두기" 챌린지를 해요.\n\n✅ 참여 방법\n- 매일 밤 폰을 거실에 두고 자요.\n- 주간 리포트 목표에 "자기 전 폰 거실에 두기"를 적어요.\n- 성공한 날은 교실 게시판에 스티커!\n\n🎁 7일 이상 성공하면 자치회 배지 스티커를 받아요.',
      startsAt: today.subtract(2, 'day').format('YYYY-MM-DD 00:00:00'),
      endsAt: today.add(20, 'day').format('YYYY-MM-DD 23:59:59'),
      isActive: true,
    },
  );
  await createNotice(
    { id: admin.row.id },
    {
      title: '이번 주 일요일까지 리포트를 올려요',
      body: '📝 주간 리포트 마감: 이번 주 일요일 밤 12시\n\n✅ 준비물\n- 폰 사용시간 캡처 2장 (사용시간 화면, 앱 순위 화면)\n- 성찰 글 100자 이상\n- 다음 주 목표 한 줄\n\n❓ 어려우면 담임 선생님께 물어보세요.',
      startsAt: today.subtract(1, 'day').format('YYYY-MM-DD 00:00:00'),
      endsAt: today.add(4, 'day').format('YYYY-MM-DD 23:59:59'),
      isActive: true,
    },
  );
  const target = commentIds[Math.floor(commentIds.length / 2)];
  if (target) {
    const reporters3 = shuffle(personas.filter((p) => p.u.row.id !== target.authorId)).slice(0, 3);
    for (const p of reporters3)
      await reportContent(p.u, 'comment', target.id, '놀리는 말 같아요').catch(() => undefined);
  }
  console.log(`칭찬 ${bonuses}건, 공지 2건, 신고 3건(자동 숨김 1)`);

  // 10) 카운트·등급·업적 재계산 + 대표 칭호
  const rc = await runRecountCaches();
  const earned = await query<{ user_id: number; code: string }>(
    'SELECT user_id, MIN(code) AS code FROM user_achievements GROUP BY user_id',
  );
  let titles = 0;
  for (const e of earned) {
    if (!chance(0.6)) continue;
    await execute('UPDATE users SET title_code = ? WHERE id = ?', [e.code, e.user_id]);
    titles += 1;
  }
  console.log(
    `등급 변경 ${rc.tiersChanged}, 칭호 획득 학생 ${earned.length}명(대표 설정 ${titles})`,
  );

  const stats = await query<{ t: string; n: number }>(
    `SELECT 'posts' AS t, COUNT(*) AS n FROM posts UNION ALL SELECT 'comments', COUNT(*) FROM comments UNION ALL SELECT 'likes', COUNT(*) FROM likes
     UNION ALL SELECT 'point_ledger', COUNT(*) FROM point_ledger UNION ALL SELECT 'login_days', COUNT(*) FROM login_days UNION ALL SELECT 'post_reads', COUNT(*) FROM post_reads
     UNION ALL SELECT 'news_topics', COUNT(*) FROM news_topics UNION ALL SELECT 'news_votes', COUNT(*) FROM news_votes UNION ALL SELECT 'council_posts', COUNT(*) FROM council_posts
     UNION ALL SELECT 'weekly_gifts', COUNT(*) FROM weekly_gifts UNION ALL SELECT 'user_achievements', COUNT(*) FROM user_achievements`,
  );
  const tiers = await query<{ tier: string; n: number }>(
    "SELECT tier, COUNT(*) AS n FROM users WHERE role = 'student' GROUP BY tier",
  );
  console.log('시연 데이터 완료:', stats.map((s) => `${s.t} ${s.n}`).join(', '));
  console.log('등급 분포:', tiers.map((t) => `${t.tier} ${t.n}`).join(', '));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
