import type {
  CouncilPollView,
  CouncilPostCard,
  CouncilPostInput,
  CouncilPostView,
} from '@server-types/api';
import { api } from './client';

function councilForm(v: CouncilPostInput, photos: File[]) {
  const form = new FormData();
  form.append('type', v.type);
  form.append('title', v.title);
  form.append('body', v.body);
  form.append('startsAt', v.startsAt);
  form.append('endsAt', v.endsAt);
  form.append('pinRequested', String(v.pinRequested));
  form.append('allowComments', String(v.allowComments));
  form.append('pollOptions', JSON.stringify(v.pollOptions));
  form.append('pollShowBeforeClose', String(v.pollShowBeforeClose));
  form.append('submit', String(v.submit));
  for (const p of photos) form.append('photos', p);
  return form;
}

/** 학생자치회 게시판 (CNC-01, 02, 05): 열람·투표는 모든 학생, 작성·수정·제출은 임원 */
export const councilApi = {
  list: (scope: 'live' | 'past' | 'drafts') =>
    api.get<CouncilPostCard[]>(`/council/posts?scope=${scope}`),
  get: (id: number) => api.get<CouncilPostView>(`/council/posts/${id}`),
  create: (v: CouncilPostInput, photos: File[]) =>
    api.post<CouncilPostView>('/council/posts', councilForm(v, photos)),
  update: (id: number, v: CouncilPostInput, photos: File[]) =>
    api.patch<CouncilPostView>(`/council/posts/${id}`, councilForm(v, photos)),
  submit: (id: number) => api.post<CouncilPostView>(`/council/posts/${id}/submit`),
  pollVote: (id: number, optionId: number) =>
    api.post<CouncilPollView>(`/council/posts/${id}/poll-vote`, { optionId }),
};
