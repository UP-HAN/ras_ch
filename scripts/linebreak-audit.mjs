/**
 * 한국어 줄바꿈 점검 (2026-10-13 사용자 요청 "줄바꿈 원칙", PRD 10장)
 *
 *   node scripts/linebreak-audit.mjs                     # 학생 화면 360px (개발 서버 http://localhost:5173)
 *   node scripts/linebreak-audit.mjs --teacher --width 1280
 *   옵션: --base URL  --width 360  --shots <폴더>(전체 화면 캡처)  --out <json>
 *
 * 화면을 차례로 열고, 글자 하나하나의 위치(Range.getClientRects)로 줄을 나눠 아래를 찾는다.
 *   (a) vertical : 3줄 이상인데 줄마다 2글자 이하 → 글자가 세로로 쌓임
 *   (b) orphan   : 2줄 이상 문단의 마지막 줄이 한 글자(문장부호 제외)
 *   (c) split    : 이름(성○이름)·날짜·배지·버튼·탭 글자가 두 줄로 나뉨
 *
 * 로그인·서버 데이터 없이 돈다: 모든 GET /api/v1 응답을 scripts/linebreak-fixtures.mjs 의 가짜 데이터로 채우고,
 * GET 이 아닌 요청은 막는다(글·댓글·투표·읽음 기록이 생기지 않는다). 비밀번호를 쓰지 않는다.
 * 가짜 데이터에는 2글자·4글자 이름, (번호) 붙은 이름, 긴 제목, 배지 여러 개를 일부러 넣었다.
 *
 * playwright 는 프로젝트 의존성이 아니다. 전역/npx 캐시에 있는 것을 쓴다(PLAYWRIGHT_MODULE 로 경로 지정 가능).
 */
import console from 'node:console';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { fixtureFor } from './linebreak-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const BASE = opt('base', process.env.AUDIT_BASE ?? 'http://localhost:5173').replace(/\/$/, '');
const WIDTH = Number(opt('width', '360'));
const HEIGHT = Number(opt('height', '800'));
const SHOTS = opt('shots', '');
const OUT = opt('out', path.join(root, 'outputs', 'code', 'linebreak-audit.json'));
const ROLE = flag('teacher') ? 'teacher' : 'student';

async function loadPlaywright() {
  const tries = [];
  if (process.env.PLAYWRIGHT_MODULE) tries.push(process.env.PLAYWRIGHT_MODULE);
  tries.push('playwright');
  const npx = path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  const npx2 = path.join(os.homedir(), '.npm', '_npx');
  for (const dir of [npx, npx2]) {
    if (!existsSync(dir)) continue;
    for (const d of readdirSync(dir)) {
      const p = path.join(dir, d, 'node_modules', 'playwright');
      if (existsSync(p)) tries.push(p);
    }
  }
  const require = createRequire(import.meta.url);
  for (const t of tries) {
    try {
      const resolved = t === 'playwright' ? require.resolve('playwright') : require.resolve(t);
      const mod = await import(pathToFileURL(resolved).href);
      return mod.chromium ? mod : mod.default;
    } catch {
      /* 다음 후보 */
    }
  }
  throw new Error(
    'playwright 를 찾지 못했어요. npx playwright --version 을 한 번 실행하거나 PLAYWRIGHT_MODULE 을 지정해 주세요.',
  );
}

/** 브라우저 안에서 도는 검사 함수 (문자열로 넘어간다) */
function auditInPage() {
  /* global document, getComputedStyle, NodeFilter */
  const PUNCT = /[\s.,!?·…~:;'"“”‘’()[\]{}<>«»\-–—/|*%+=#@&^_`→←↑↓✓✔·。、！？）（]/u;
  const LETTER = /[\p{L}\p{N}]/u;
  const NAME = /[가-힣]{1,2}○[가-힣○]*/gu;
  const results = [];
  const seen = new Set();

  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    if (
      s.position === 'absolute' &&
      (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)')
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const containerOf = (node) => {
    let el = node.parentElement;
    while (el && el !== document.body) {
      const d = getComputedStyle(el).display;
      if (d !== 'inline' && d !== 'contents') return el;
      el = el.parentElement;
    }
    return document.body;
  };
  const describe = (el) => {
    const parts = [];
    let e = el;
    for (let i = 0; e && e !== document.body && i < 4; i += 1) {
      let s = e.tagName.toLowerCase();
      const tid = e.getAttribute('data-testid');
      if (tid) s += `[data-testid=${tid}]`;
      else if (e.className && typeof e.className === 'string')
        s += '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.');
      parts.unshift(s);
      e = e.parentElement;
    }
    return parts.join(' > ');
  };

  // 1) 컨테이너별 글자 위치 모으기
  const byContainer = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? '';
    if (!text.trim()) continue;
    const parent = n.parentElement;
    if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION'].includes(parent.tagName))
      continue;
    if (parent.closest('[aria-hidden="true"]') && !LETTER.test(text)) continue;
    if (!isVisible(parent)) continue;
    const c = containerOf(n);
    if (!byContainer.has(c)) byContainer.set(c, []);
    const list = byContainer.get(c);
    const range = document.createRange();
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (/\s/.test(ch)) {
        list.push({ ch, top: null });
        continue;
      }
      range.setStart(n, i);
      range.setEnd(n, i + 1);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const r = rects[0];
      if (r.width === 0 && r.height === 0) continue;
      list.push({ ch, top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2 });
    }
  }

  // 2) 줄 나누기
  for (const [el, chars] of byContainer) {
    const lines = [];
    let cur = null;
    for (const c of chars) {
      if (c.top === null) {
        if (cur) cur.text += ' ';
        continue;
      }
      if (!cur || c.mid > cur.bottom) {
        cur = { text: '', bottom: c.bottom };
        lines.push(cur);
      }
      cur.text += c.ch;
      cur.bottom = Math.max(cur.bottom, c.bottom);
    }
    const clean = lines.map((l) => l.text.trim()).filter((t) => t.length > 0);
    if (clean.length === 0) continue;
    const letters = (t) => [...t].filter((ch) => LETTER.test(ch) && !PUNCT.test(ch)).length;
    const full = clean.join(' ');
    const push = (kind, extra) => {
      const key = `${kind}|${full}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ kind, where: describe(el), text: full.slice(0, 80), lines: clean, ...extra });
    };

    // (a) 세로 쌓임
    if (clean.length >= 3 && clean.every((t) => letters(t) <= 2)) push('vertical');
    // (b) 마지막 한 글자
    if (clean.length >= 2) {
      const last = clean[clean.length - 1];
      // 남은 글자(이모지 포함, 문장부호 제외)가 딱 한 글자일 때만. "👍 3" 처럼 기호+숫자 덩어리는 괜찮다
      const solid = [...last].filter(
        (ch) => !PUNCT.test(ch) && ch.trim() && ![0xfe0f, 0x200d].includes(ch.codePointAt(0) ?? 0),
      );
      if (letters(last) === 1 && solid.length === 1 && letters(full) >= 2) push('orphan');
    }
    // (c) 이름·배지·버튼·탭 나뉨
    const compact =
      el.matches('button, [role=tab], a, .name-nowrap, label, th') ||
      /rounded-full/.test(typeof el.className === 'string' ? el.className : '');
    if (clean.length >= 2 && compact && full.length <= 24) push('split', { reason: 'compact' });
    // 이름 토큰이 두 줄에 걸치는지
    if (clean.length >= 2) {
      const joined = clean.join('\n');
      for (const m of joined.matchAll(NAME))
        if (m[0].includes('\n')) push('split', { reason: 'name' });
      // 날짜(2026. 10. 13.)가 두 줄에 걸치는지
      for (const m of joined.matchAll(/\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?/g))
        if (m[0].includes('\n')) push('split', { reason: 'date' });
      // 줄 끝/줄 시작에 이름 조각
      for (let i = 0; i < clean.length - 1; i += 1) {
        const a = clean[i];
        const b = clean[i + 1];
        if (/[가-힣]○?$/.test(a) && /^[○][가-힣]?/.test(b)) push('split', { reason: 'name' });
      }
    }
  }
  return results;
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    reducedMotion: 'reduce',
  });
  // 읽기 전용 + 가짜 데이터: 서버로 아무 요청도 보내지 않는다
  await context.route('**/api/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.abort();
    const url = new URL(req.url());
    const data = fixtureFor(url.pathname, url.search, ROLE);
    if (data === undefined)
      return route.fulfill({
        status: 404,
        json: { ok: false, error: { code: 'NOT_FOUND', message: '점검용 데이터가 없어요.' } },
      });
    return route.fulfill({ status: 200, json: { ok: true, data } });
  });
  const page = await context.newPage();
  const all = [];
  const run = async (label, url, after) => {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    // 열려 있는 축하 창(모달)은 닫는다
    for (let i = 0; i < 3; i += 1) {
      const dialog = page.locator('[role=dialog]');
      if (!(await dialog.count())) break;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const close = dialog.getByRole('button').last();
      if (await dialog.count()) await close.click({ timeout: 500 }).catch(() => {});
    }
    if (after) await after();
    const found = await page.evaluate(auditInPage);
    for (const f of found) all.push({ page: label, url: page.url().replace(BASE, ''), ...f });
    console.log(
      `${label.padEnd(22)} ${page.url().replace(BASE, '').padEnd(28)} 문제 ${found.length}`,
    );
    if (SHOTS) {
      await mkdir(SHOTS, { recursive: true });
      await page.screenshot({
        path: path.join(SHOTS, `${WIDTH}-${label.replace(/[^\w가-힣-]+/g, '_')}.png`),
        fullPage: true,
      });
    }
  };

  if (ROLE === 'teacher') {
    for (const p of [
      '/teacher',
      '/teacher/pending',
      '/teacher/posts',
      '/teacher/posts/501',
      '/teacher/students',
      '/teacher/comments',
      '/teacher/reports',
      '/teacher/stats',
      '/teacher/hall-of-fame',
      '/teacher/news',
      '/teacher/council',
    ])
      await run(`T${p.replace('/teacher', '').replace(/\//g, '-') || '-dashboard'}`, p);
  } else {
    await context.route('**/api/v1/me', (r) =>
      r.request().method() === 'GET' && new URL(r.request().url()).pathname === '/api/v1/me'
        ? r.fulfill({
            status: 401,
            json: { ok: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요해요.' } },
          })
        : r.fallback(),
    );
    await run('login', '/login');
    await context.unroute('**/api/v1/me');
    await run('home', '/');
    await run('write', '/write');
    await run('write-report', '/write/report');
    await run('write-article', '/write/article');
    await run('write-council', '/write/council');
    await run('edit-report', '/posts/500/edit');
    await run('council', '/council');
    await run('council-detail', '/council/302');
    await run('posts', '/posts');
    await run('post-report', '/posts/500');
    await run('post-article', '/posts/501');
    await run('debate', '/debate');
    await run('debate-topic', '/debate/70');
    for (const [i, tab] of ['주간 TOP', '월간', '학급', '역대'].entries())
      await run(`hall-${i}`, '/hall-of-fame', async () => {
        await page
          .getByRole('tab', { name: tab })
          .click()
          .catch(() => {});
        await page.waitForTimeout(700);
      });
    await run('me', '/me');
    await run('me-points', '/me/points');
    await run('bug-report', '/me/bug-report');
    await run('review', '/review');
    await run('review-post', '/review/600');
    await run('change-password', '/change-password');
  }

  await browser.close();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(all, null, 2), 'utf8');
  const count = (k) => all.filter((x) => x.kind === k).length;
  console.log(
    `
세로 쌓임 ${count('vertical')} · 마지막 한 글자 ${count('orphan')} · 이름/배지/버튼 나뉨 ${count('split')}`,
  );
  for (const f of all)
    console.log(
      `- [${f.kind}${f.reason ? `:${f.reason}` : ''}] ${f.page}  "${f.lines.join(' / ')}"  ← ${f.where}`,
    );
  console.log(`
결과 파일: ${OUT}`);
  if (all.length) process.exitCode = 1;
}

await main();
