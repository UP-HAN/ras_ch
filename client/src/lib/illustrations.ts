/**
 * 일러스트 경로 표 (디자인 개편 01-spec 3.6). 원본 PNG 는 outputs/art/, 웹용 webp 는 client/public/illustrations/.
 * 그림이 아직 없거나 못 불러와도 화면이 깨지지 않게 Mascot/Illustration 이 빈 자리를 숨긴다.
 */
export const ILLUSTRATIONS = {
  hello: '/illustrations/01-mascot-hello.webp',
  cheer: '/illustrations/02-mascot-cheer.webp',
  sleep: '/illustrations/03-mascot-sleep.webp',
  think: '/illustrations/04-mascot-think.webp',
  write: '/illustrations/05-mascot-write.webp',
  trophy: '/illustrations/06-mascot-trophy.webp',
  oops: '/illustrations/07-mascot-oops.webp',
  loginHero: '/illustrations/08-login-hero.webp',
  activities: '/illustrations/09-activities.webp',
  shine: '/illustrations/10-mascot-shine.webp',
  // RAS = Reading·Art·Sports (2026-10-13 사용자 요청): 책 읽는·그림 그리는·공 차는 초롱이 (512x512)
  rasReading: '/illustrations/12-ras-reading.webp',
  rasArt: '/illustrations/13-ras-art.webp',
  rasSports: '/illustrations/14-ras-sports.webp',
} as const;

export type IllustrationKey = keyof typeof ILLUSTRATIONS;

/** 정사각형 마스코트 그림(512x512). loginHero·activities 는 가로 그림(960x640) */
export type MascotKey = Exclude<IllustrationKey, 'loginHero' | 'activities'>;

/** RAS 영역 아이콘 (투명 바탕 스티커, 128·256 두 크기). 키는 기사 영역 태그(R·A·S)와 같다 */
export type RasKind = 'R' | 'A' | 'S';

export const RAS_ICONS: Record<RasKind, { src128: string; src256: string; emoji: string }> = {
  R: {
    src128: '/illustrations/15-icon-reading-128.webp',
    src256: '/illustrations/15-icon-reading-256.webp',
    emoji: '📚',
  },
  A: {
    src128: '/illustrations/16-icon-art-128.webp',
    src256: '/illustrations/16-icon-art-256.webp',
    emoji: '🎨',
  },
  S: {
    src128: '/illustrations/17-icon-sports-128.webp',
    src256: '/illustrations/17-icon-sports-256.webp',
    emoji: '⚽',
  },
};

export function isRasKind(key: string): key is RasKind {
  return key === 'R' || key === 'A' || key === 'S';
}

/** 기사 영역(R·A·S)에 맞는 초롱이 그림. 다른 영역이면 null */
export function rasMascot(key: string | undefined): MascotKey | null {
  if (key === 'R') return 'rasReading';
  if (key === 'A') return 'rasArt';
  if (key === 'S') return 'rasSports';
  return null;
}
