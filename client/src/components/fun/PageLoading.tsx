import { LanternLogo } from './LanternLogo';
import { Mascot } from './Mascot';

/** 페이지 전체 로딩 (01-spec 6.3): 초롱이가 좌우로 흔들리며(6.4 #9) "불러오고 있어요…" */
export function PageLoading() {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16">
      <Mascot
        name="hello"
        size={96}
        className="anim-swing"
        fallback={<LanternLogo size={72} className="anim-swing" />}
      />
      <p className="text-base font-bold text-ink-muted">불러오고 있어요…</p>
    </div>
  );
}
