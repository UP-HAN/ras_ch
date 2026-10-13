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
} as const;

export type IllustrationKey = keyof typeof ILLUSTRATIONS;

/** 정사각형 마스코트 그림(512x512). loginHero·activities 는 가로 그림(960x640) */
export type MascotKey = Exclude<IllustrationKey, 'loginHero' | 'activities'>;
