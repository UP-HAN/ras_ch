import type { NewsTopicCard as TopicCardData } from '@server-types/api';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui';
import { VoteBar } from './VoteBar';

import { TOPIC_TYPE_LABEL } from './topicLabels';

const closeLabel = (closeAt: string | null) => {
  if (!closeAt) return '';
  const d = new Date(closeAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days <= 0) return '오늘 마감';
  return `${days}일 남음`;
};

/** 토론 주제 카드 (6.1 토론방 목록·홈) */
export function TopicCard({ t, home = false }: { t: TopicCardData; home?: boolean }) {
  const live = t.status === 'live';
  return (
    <Link
      to={`/debate/${t.id}`}
      data-testid={`topic-card-${t.id}`}
      className="block rounded-lg border border-line bg-surface p-4 shadow-card hover:bg-primary-50"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={t.type === 'vote' ? 'primary' : 'info'}>{TOPIC_TYPE_LABEL[t.type]}</Badge>
        {t.tags.map((tag) => (
          <Badge key={tag} tone="neutral">
            #{tag}
          </Badge>
        ))}
        <span className="ml-auto text-base text-ink-muted">
          {live
            ? closeLabel(t.closeAt)
            : t.closeAt
              ? `${new Date(t.closeAt).toLocaleDateString('ko-KR')} 마감`
              : ''}
        </span>
      </div>
      <p className={`mt-2 font-extrabold ${home ? 'text-xl' : 'text-lg'}`}>{t.title}</p>
      {t.type === 'vote' && (
        <div className="mt-2">
          <VoteBar votes={t.votes} compact />
        </div>
      )}
      <p className="mt-2 text-base text-ink-muted">
        💬 의견 {t.commentCount}개
        {t.myVote && <span className="ml-2">· 나는 {t.myVote === 'agree' ? '찬성' : '반대'}</span>}
      </p>
    </Link>
  );
}
