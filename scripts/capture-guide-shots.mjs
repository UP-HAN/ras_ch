/**
 * 안내 영상용 스크린샷 촬영 (outputs/06-video-spec.md 6장). 시연 사이트 ras1 에서만 쓴다.
 *   RAS1_T2_PW=... RAS1_S_PW=... node scripts/capture-guide-shots.mjs [--only student|teacher]
 * 결과: outputs/video/shots/{student,teacher}/*.png + boxes.json(강조할 요소 위치, CSS px, 화면 기준)
 * 비밀번호는 환경 변수로만 받는다(코드·git 에 남기지 않는다).
 */
/* global window, fetch -- page.evaluate 안(브라우저)에서만 쓴다 */
import console from 'node:console';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.RAS1_BASE ?? 'https://ras1.ches.es.kr';
const T2 = { id: 't2@ches.es.kr', pw: process.env.RAS1_T2_PW };
const S1 = { id: '266101', pw: process.env.RAS1_S_PW };
const FIRST = { id: '266102', pw: process.env.RAS1_FIRST_PW ?? '1234' }; // 첫 로그인 화면용(바꾸지 않음)
const ONLY = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : '';
const OUT = path.join(root, 'outputs', 'video', 'shots');
const ASSETS = path.join(root, 'outputs', 'video', 'assets');
if (!T2.pw || !S1.pw) throw new Error('RAS1_T2_PW, RAS1_S_PW 환경 변수가 필요해요.');

async function loadPlaywright() {
  const tries = [];
  if (process.env.PLAYWRIGHT_MODULE) tries.push(process.env.PLAYWRIGHT_MODULE);
  for (const dir of [
    path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx'),
    path.join(os.homedir(), '.npm', '_npx'),
  ]) {
    if (!existsSync(dir)) continue;
    for (const d of readdirSync(dir)) {
      const p = path.join(dir, d, 'node_modules', 'playwright');
      if (existsSync(p)) tries.push(p);
    }
  }
  const require = createRequire(import.meta.url);
  for (const t of tries) {
    try {
      const mod = await import(pathToFileURL(require.resolve(t)).href);
      return mod.chromium ? mod : mod.default;
    } catch {
      /* 다음 후보 */
    }
  }
  throw new Error('playwright 를 찾지 못했어요.');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

function makeShooter(kind) {
  const dir = path.join(OUT, kind);
  mkdirSync(dir, { recursive: true });
  const boxes = {};
  return {
    boxes,
    /** 화면을 찍고, 강조할 요소들의 위치를 잰다. targets: { 이름: locator } */
    async shot(page, file, targets = {}, opts = {}) {
      await page.waitForTimeout(opts.wait ?? 900);
      const rec = {};
      for (const [name, loc] of Object.entries(targets)) {
        try {
          const b = await loc.first().boundingBox({ timeout: 2000 });
          if (b)
            rec[name] = {
              x: Math.round(b.x),
              y: Math.round(b.y),
              w: Math.round(b.width),
              h: Math.round(b.height),
            };
        } catch {
          rec[name] = null;
        }
      }
      await page.screenshot({
        path: path.join(dir, file),
        fullPage: !!opts.fullPage,
        animations: 'disabled',
      });
      boxes[file] = { viewport: page.viewportSize(), fullPage: !!opts.fullPage, boxes: rec };
      console.log(
        '찍음',
        kind,
        file,
        Object.keys(rec)
          .filter((k) => !rec[k])
          .map((k) => `(못 찾음:${k})`)
          .join(' '),
      );
    },
    save() {
      writeFileSync(path.join(dir, 'boxes.json'), JSON.stringify(boxes, null, 2));
    },
  };
}

async function login(page, who) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('예: 265101').fill(who.id);
  await page.getByLabel('비밀번호').fill(who.pw);
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}

/** 요소를 화면 가운데로 */
async function center(page, loc) {
  await loc.first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
}
async function top(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}
async function go(page, url) {
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(`/api/v1${u}`, {
        method: m,
        headers: { 'x-requested-with': 'fetch', 'content-type': 'application/json' },
        body: b ? JSON.stringify(b) : undefined,
      });
      return r.json();
    },
    [method, url, body],
  );

const mobile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  reducedMotion: 'reduce',
};
const desktop = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
};

let reportPostId = null;

// ---------------- 학생 ① (제출 전) ----------------
const S = makeShooter('student');
const sCtx = await browser.newContext(mobile);
const sp = await sCtx.newPage();
if (ONLY !== 'teacher') {
  // s02a 로그인 화면(아이디만 입력)
  await go(sp, '/login');
  await sp.getByPlaceholder('예: 265101').fill('266101');
  await S.shot(sp, 's02a-login.png', {
    id: sp.getByPlaceholder('예: 265101'),
    pw: sp.getByLabel('비밀번호'),
    login: sp.getByRole('button', { name: '로그인' }),
  });
  // s02b 첫 로그인 비밀번호 바꾸기 화면 (266102, 바꾸지 않고 찍기만)
  const fCtx = await browser.newContext(mobile);
  const fp = await fCtx.newPage();
  try {
    await login(fp, FIRST);
    await go(fp, '/change-password');
    await S.shot(fp, 's02b-first-password.png', {
      current: fp.getByLabel('지금 받은 비밀번호'),
      next: fp.getByLabel('새 비밀번호', { exact: true }),
      again: fp.getByLabel('새 비밀번호 한 번 더'),
    });
  } catch (e) {
    console.log('s02b 건너뜀:', e.message);
  }
  await fCtx.close();

  await login(sp, S1);
  await go(sp, '/');
  await sp.keyboard.press('Escape');
  await top(sp);
  await S.shot(sp, 's03-home-top.png', {
    greet: sp.getByText('안녕하세요').locator('..').locator('..'),
    points: sp.getByText('이번 주 포인트'),
    attendance: sp.getByTestId('attendance-stamp'),
  });
  await center(sp, sp.getByText('이번 주 미션'));
  await S.shot(sp, 's04-home-missions.png', {
    missions: sp.getByText('이번 주 미션').locator('xpath=ancestor::section[1]'),
    classMission: sp.getByText(/우리 반 미션/),
  });
  await go(sp, '/write');
  await S.shot(sp, 's05-write.png', {
    report: sp.getByText('폰프리 주간 리포트').first(),
    reportBtn: sp.getByRole('link', { name: '리포트 쓰기' }),
  });
  await S.shot(sp, 's19-polite.png', { polite: sp.getByText(/존댓말로/).first() });

  // s13 일기형 (먼저 찍고 다시 연다)
  await go(sp, '/write/report');
  const diaryBtn = sp.getByRole('button', { name: /일기/ }).first();
  if (await diaryBtn.count()) {
    await diaryBtn.click();
    await center(sp, sp.getByText('리포트 종류'));
    await S.shot(sp, 's13-diary.png', {
      type: sp.getByText('리포트 종류').locator('xpath=ancestor::section[1]'),
      diary: diaryBtn,
    });
  }
  // s09a 빈 폼 맨 위
  await go(sp, '/write/report');
  await top(sp);
  await S.shot(sp, 's09a-report-type.png', {
    week: sp.getByText('어느 주 리포트인가요?'),
    type: sp.getByText('리포트 종류'),
  });
  // s09b 캡처 2장
  const files = sp.locator('input[type=file]');
  await files.nth(0).setInputFiles(path.join(ASSETS, 'phone-weekly-report.webp'));
  await files.nth(1).setInputFiles(path.join(ASSETS, 'phone-digital-wellbeing.webp'));
  await center(sp, sp.getByText('캡처 2장'));
  await S.shot(sp, 's09b-report-captures.png', {
    cat: sp.getByText('㉠ 하루 평균 사용시간 화면'),
    app: sp.getByText('㉡ 많이 쓴 앱 순위 화면'),
  });
  // s10 숫자
  await sp.getByLabel('시간', { exact: true }).fill('4');
  await sp.getByLabel('분', { exact: true }).fill('8');
  await sp.getByRole('button', { name: '게임', exact: true }).click();
  await sp.getByLabel('가장 많이 쓴 앱').fill('도깨비의세계');
  await center(sp, sp.getByText('캡처를 보고 적어요'));
  await S.shot(sp, 's10-report-numbers.png', {
    time: sp.getByText('하루 평균 사용시간').first(),
    category: sp.getByRole('button', { name: '게임', exact: true }),
    app: sp.getByLabel('가장 많이 쓴 앱'),
  });
  // s11 성찰 글
  await sp
    .getByLabel('성찰 글')
    .fill(
      '이번 주에는 게임을 하루에 네 시간 넘게 했어요. 숙제를 늦게 시작해서 잠도 늦게 잤어요. 다음 주에는 저녁 먹고 나서 폰을 거실에 두고, 그 시간에 도서관에서 빌린 책을 읽어 보려고 해요. 주말에는 친구들과 운동장에서 축구도 하고 싶어요.',
    );
  const goal = sp.getByLabel('다음 주 목표 (한 줄)');
  if (await goal.count()) await goal.fill('저녁 먹고 나서 폰은 거실에 두기');
  await center(sp, sp.getByLabel('성찰 글'));
  await S.shot(sp, 's11-report-body.png', { body: sp.getByLabel('성찰 글'), goal });
  // s12 보내기 버튼
  const submit = sp.locator('button[type=submit]');
  await center(sp, submit);
  await S.shot(sp, 's12-report-submit.png', { submit });
  // 실제로 제출 (시연 자료 R4)
  await submit.click();
  await sp.waitForTimeout(3000);
  const mine = await api(sp, 'GET', '/posts/mine');
  reportPostId = mine?.data?.items?.[0]?.id ?? mine?.data?.[0]?.id ?? null;
  console.log('제출한 리포트 id', reportPostId, sp.url());
}

// ---------------- 교사 ----------------
const T = makeShooter('teacher');
const tCtx = await browser.newContext(desktop);
const tp = await tCtx.newPage();
await login(tp, T2);
if (ONLY !== 'student') {
  await go(tp, '/teacher');
  await tp
    .getByRole('button', { name: '6-1', exact: true })
    .first()
    .click()
    .catch(() => {});
  await tp.waitForTimeout(1200);
  await top(tp);
  await T.shot(tp, 't04-dashboard-top.png', {
    classTabs: tp.getByRole('group', { name: /반/ }).first(),
    stats: tp.getByText('이번 주 제출률').first(),
  });
  await center(tp, tp.getByText(/상위 5명/).first());
  await T.shot(tp, 't05-dashboard-bottom.png', {
    top5: tp
      .getByText(/상위 5명/)
      .first()
      .locator('xpath=ancestor::section[1]'),
    pending: tp.getByText('승인 대기').first(),
    missing: tp.getByText(/미참여|안 낸/).first(),
  });
  await go(tp, '/teacher/pending?class=1');
  await top(tp);
  await T.shot(tp, 't06-pending.png', {
    approve: tp.getByRole('button', { name: '승인', exact: true }).first(),
  });
  await center(tp, tp.getByRole('button', { name: '승인', exact: true }).first());
  await T.shot(tp, 't07-pending-card.png', {
    approve: tp.getByRole('button', { name: '승인', exact: true }).first(),
    reject: tp.getByRole('button', { name: '반려', exact: true }).first(),
  });
  await tp.getByRole('button', { name: '반려', exact: true }).first().click();
  await tp.waitForTimeout(700);
  await T.shot(tp, 't08-reject-modal.png', { reasons: tp.getByRole('dialog') });
  await tp.keyboard.press('Escape');
  await tp
    .getByRole('button', { name: '취소' })
    .first()
    .click()
    .catch(() => {});

  await go(tp, '/teacher/students?class=1');
  await T.shot(tp, 't09-students.png', {
    table: tp.locator('table').first(),
    add: tp.getByRole('button', { name: '+ 학생 추가' }),
  });
  await T.shot(tp, 't11a-row-actions.png', {
    bonus: tp.getByRole('button', { name: '칭찬' }).first(),
    reset: tp.getByRole('button', { name: '비번 초기화' }).first(),
  });
  // t10 임시 비밀번호 카드 (266102 초기화 — 시연 자료)
  const row = tp.locator('tr', { hasText: '266102' }).first();
  await row.getByRole('button', { name: '비번 초기화' }).click();
  await tp.waitForTimeout(500);
  await tp
    .getByRole('dialog')
    .getByRole('button', { name: /초기화/ })
    .last()
    .click();
  await tp.waitForTimeout(1500);
  await top(tp);
  await T.shot(tp, 't10-temp-password.png', {
    card: tp.getByText('임시 비밀번호').first().locator('xpath=ancestor::section[1]'),
  });
  await tp
    .getByRole('button', { name: '확인했어요' })
    .click()
    .catch(() => {});
  await tp.getByRole('button', { name: '칭찬' }).first().click();
  await tp.waitForTimeout(600);
  await T.shot(tp, 't11b-bonus-modal.png', { dialog: tp.getByRole('dialog') });
  await tp.keyboard.press('Escape');

  await go(tp, '/teacher/comments?class=1');
  await T.shot(tp, 't13a-comments.png', {});
  await go(tp, '/teacher/reports');
  await T.shot(tp, 't13b-reports.png', {});
  await go(tp, '/teacher/news');
  await T.shot(
    tp,
    't14-news.png',
    { schedule: tp.getByText('게시 일정 (승인 권한 교사)') },
    { fullPage: true },
  );
  await top(tp);
  await T.shot(tp, 't15-best-opinion.png', {
    best: tp.getByText('마감된 토론 · 베스트 의견 뽑기'),
  });
  await go(tp, '/teacher/hall-of-fame');
  await T.shot(tp, 't16-hall-weekly.png', {});
  const monthly = tp
    .getByRole('tab', { name: '월간' })
    .or(tp.getByRole('button', { name: '월간' }));
  if (await monthly.count()) {
    await monthly.first().click();
    await tp.waitForTimeout(1200);
    await T.shot(tp, 't17-class-award.png', {});
  }
}
// 제출한 리포트 승인 (R4) → 학생 축하 창(R6)
if (reportPostId) {
  const r = await api(tp, 'POST', `/teacher/posts/${reportPostId}/approve`, {});
  console.log('승인', r.ok, r.error?.message ?? '');
}
T.save();
await tCtx.close();

// ---------------- 학생 ② (승인 후) ----------------
if (ONLY !== 'teacher') {
  await go(sp, '/');
  await sp.waitForTimeout(1500);
  await S.shot(sp, 's14a-celebration.png', { celebration: sp.getByTestId('celebration') });
  await sp.keyboard.press('Escape');
  await go(sp, '/me/points');
  await S.shot(sp, 's14b-my-points.png', {});
  await go(sp, '/posts');
  const card = sp.locator('a[href^="/posts/"]').filter({ hasNotText: '류○은' }).first();
  if (await card.count()) {
    await card.click();
    await sp.waitForLoadState('networkidle').catch(() => {});
    await center(sp, sp.getByText(/엄지척|응원/).first());
    await S.shot(sp, 's15-friend-post.png', {
      react: sp.getByText(/엄지척/).first(),
      comment: sp.getByRole('textbox').first(),
    });
  }
  await go(sp, '/debate/7');
  await S.shot(sp, 's16a-debate-vote.png', {
    vote: sp.getByRole('button', { name: /찬성/ }).first(),
  });
  await center(sp, sp.getByText(/의견/).nth(2));
  await S.shot(sp, 's16b-debate-opinion.png', { write: sp.getByRole('textbox').first() });
  await go(sp, '/hall-of-fame');
  await S.shot(sp, 's17-hall.png', {});
  await go(sp, '/me');
  await center(sp, sp.getByText('내 등급'));
  await S.shot(sp, 's18a-tier.png', {
    tier: sp.getByText('내 등급').locator('xpath=ancestor::section[1]'),
  });
  await center(sp, sp.getByText('내 칭호'));
  await S.shot(sp, 's18b-titles.png', {
    titles: sp.getByText('내 칭호').locator('xpath=ancestor::section[1]'),
  });
}
S.save();
await browser.close();
console.log('끝');
