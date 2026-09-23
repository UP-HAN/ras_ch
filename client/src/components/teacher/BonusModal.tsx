import { useMutation } from '@tanstack/react-query';
import type { BonusResult, TeacherUser } from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { pointsApi } from '@/api/points';
import { Button, Card, Input } from '@/components/ui';

const AMOUNTS = [5, 10, 15, 20];

/** PT-04 교사 칭찬 포인트: 5~20P + 사유 필수. 상한 도달 시 서버 메시지(남은 한도) 표시 */
export function BonusModal({
  student,
  onClose,
  onGranted,
}: {
  student: TeacherUser;
  onClose: () => void;
  onGranted: (r: BonusResult) => void;
}) {
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const grant = useMutation({
    mutationFn: () => pointsApi.bonus(student.id, amount, reason.trim()),
    onSuccess: onGranted,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-accent-900/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card title={`${student.name} 학생 칭찬 포인트`} className="w-full max-w-md">
        <p className="mb-2 text-base font-semibold">얼마를 줄까요?</p>
        <div className="mb-3 flex gap-2">
          {AMOUNTS.map((a) => (
            <Button
              key={a}
              className="flex-1"
              variant={amount === a ? 'primary' : 'secondary'}
              onClick={() => setAmount(a)}
            >
              {a}P
            </Button>
          ))}
        </div>
        <Input
          label="칭찬 이유 (학생에게 보여요)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={100}
          placeholder="예: 목표를 지키려고 노력했어요"
          error={error ?? undefined}
          hint="학생 한 명에게 주 50P, 선생님 전체 주 300P까지 줄 수 있어요."
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            loading={grant.isPending}
            disabled={reason.trim().length < 2}
            onClick={() => grant.mutate()}
          >
            {amount}P 주기
          </Button>
        </div>
      </Card>
    </div>
  );
}
