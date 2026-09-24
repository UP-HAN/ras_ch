/** 시연 인스턴스(DEMO_MODE=1) 상단 배너 — 가상 데이터임을 항상 보여 준다 */
export function DemoBanner() {
  return (
    <div
      data-testid="demo-banner"
      className="fixed inset-x-0 top-0 z-30 bg-warn-600 px-3 py-1 text-center text-base font-bold text-white"
    >
      🎭 시연용 가상 데이터예요. 실제 학생 정보가 아니에요.
    </div>
  );
}
