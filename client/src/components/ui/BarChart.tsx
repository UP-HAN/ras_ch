/**
 * 가벼운 CSS 막대 그래프 (ADM-05, TCH-01). 차트 라이브러리 없이 값·라벨만 받는다.
 */
export interface BarDatum {
  label: string;
  value: number | null;
  /** 막대 아래 보조 텍스트 */
  sub?: string;
}

export function BarChart({
  data,
  unit = '',
  color = 'bg-primary-500',
  height = 120,
  title,
}: {
  data: BarDatum[];
  unit?: string;
  color?: string;
  height?: number;
  title?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  return (
    <figure className="min-w-0 max-w-full">
      {title && <figcaption className="mb-2 text-base font-semibold">{title}</figcaption>}
      <div className="overflow-x-auto">
        <ul className="flex min-w-full items-end gap-1" style={{ height }}>
          {data.map((d) => (
            <li key={d.label} className="flex min-w-10 flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-base leading-none text-ink-muted">
                {d.value === null ? '–' : `${d.value}${unit}`}
              </span>
              <div
                role="img"
                aria-label={`${d.label} ${d.value ?? '없음'}${unit}`}
                className={`w-full rounded-t-md ${d.value === null ? 'bg-line' : color}`}
                style={{
                  height: `${d.value === null ? 4 : Math.max(4, ((d.value ?? 0) / max) * (height - 40))}px`,
                }}
              />
            </li>
          ))}
        </ul>
        <ul className="mt-1 flex min-w-full gap-1">
          {data.map((d) => (
            <li
              key={d.label}
              className="min-w-10 flex-1 truncate text-center text-base text-ink-muted"
            >
              {d.sub ?? d.label}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
