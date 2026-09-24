import type {
  NewsProposalInput,
  NewsTopicDetail,
  NewsTopicPage,
  NewsVoteResult,
  NewsVoteSide,
} from '@server-types/api';
import { api } from './client';

/** 뉴스 토론방 (NWS-06~10) */
export const newsApi = {
  list: (status: 'live' | 'closed', cursor?: string | null) =>
    api.get<NewsTopicPage>(
      `/news/topics?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  get: (id: number) => api.get<NewsTopicDetail>(`/news/topics/${id}`),
  vote: (id: number, side: NewsVoteSide) =>
    api.put<NewsVoteResult>(`/news/topics/${id}/vote`, { side }),
  propose: (input: NewsProposalInput) => api.post<{ id: number }>('/council/bank-proposals', input),
};
