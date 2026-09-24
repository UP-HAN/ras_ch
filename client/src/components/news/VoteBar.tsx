import type { NewsVoteSummary } from '@server-types/api';

/** 찬반 비율 막대 (NWS-06). 0표면 회색 */
export function VoteBar({ votes, compact = false }: { votes: NewsVoteSummary; compact?: boolean }) {
  const empty = votes.total === 0;
  return (
    <div>
      <div
        role="img"
        aria-label={`찬성 ${votes.agreePct}% 반대 ${votes.disagreePct}%, ${votes.total}명 투표`}
        className={`flex w-full overflow-hidden rounded-full bg-line ${compact ? 'h-3' : 'h-5'}`}
      >
        {!empty && (
          <>
            <div className="bg-success-600" style={{ width: `${votes.agreePct}%` }} />
            <div className="bg-danger-600" style={{ width: `${votes.disagreePct}%` }} />
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between text-base">
        <span className="font-semibold text-success-600">
          👍 찬성 {votes.agreePct}% ({votes.agree})
        </span>
        <span className="font-semibold text-danger-600">
          👎 반대 {votes.disagreePct}% ({votes.disagree})
        </span>
      </div>
    </div>
  );
}
