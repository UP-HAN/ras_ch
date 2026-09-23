/** 클래스 이름 이어붙이기(빈 값 무시) */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
