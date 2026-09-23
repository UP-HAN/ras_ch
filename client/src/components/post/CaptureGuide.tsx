import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { postsApi } from '@/api/posts';
import { cn } from '@/lib/cn';

const DEVICES = [
  { key: 'android_samsung', label: '갤럭시·안드로이드' },
  { key: 'iphone', label: '아이폰' },
] as const;

/**
 * 캡처 안내 (RPT-05, 부록 B, APR-02d). 기기별 탭 + "이름 보이는 화면 캡처 금지" 경고.
 * 문구는 settings.capture_guide (관리자 편집은 S5).
 */
export function CaptureGuide({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const q = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: postsApi.settings,
    staleTime: 5 * 60_000,
  });
  const [open, setOpen] = useState(defaultOpen);
  const [device, setDevice] = useState<(typeof DEVICES)[number]['key']>('android_samsung');
  const guide = q.data?.captureGuide;

  return (
    <section className="rounded-lg border border-info-600/30 bg-info-50">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-tap w-full items-center justify-between px-4 text-left text-base font-bold text-info-600"
      >
        📷 어떤 화면을 캡처하나요?
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div role="tablist" className="mb-2 flex gap-1">
            {DEVICES.map((d) => (
              <button
                key={d.key}
                role="tab"
                type="button"
                aria-selected={device === d.key}
                onClick={() => setDevice(d.key)}
                className={cn(
                  'min-h-tap rounded-md px-3 text-base font-semibold',
                  device === d.key ? 'bg-info-600 text-white' : 'bg-surface text-info-600',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-base">{guide?.[device] ?? '안내를 불러오는 중이에요.'}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-base">
            <li>
              <strong>캡처 ㉠</strong> 하루 평균 사용시간이 보이는 화면 → 여기서 시간·분을 읽어
              적어요
            </li>
            <li>
              <strong>캡처 ㉡</strong> 많이 쓴 앱 순위가 보이는 화면 → 1위 앱 이름을 적어요
            </li>
          </ol>
          <p className="mt-2 rounded-md bg-warn-50 px-3 py-2 text-base font-semibold text-warn-600">
            ⚠️ {guide?.warning ?? '이름이나 프로필, 알림, 메시지가 보이는 화면은 캡처하지 마세요.'}
          </p>
        </div>
      )}
    </section>
  );
}
