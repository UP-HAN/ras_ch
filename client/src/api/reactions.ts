import type {
  AttendanceView,
  CommentView,
  LikeResult,
  MyPostView,
  PostListPage,
  PostReactionsView,
  ReadResult,
  ReportResult,
  StudentPostView,
} from '@server-types/api';
import { api } from './client';

export interface ArticleFormValues {
  title: string;
  articleType: string;
  tags: string[];
  body: string;
  oneLine: string;
  submit: boolean;
}

function articleForm(v: ArticleFormValues, photos: File[]) {
  const form = new FormData();
  form.append('title', v.title);
  form.append('articleType', v.articleType);
  form.append('tags', v.tags.join(','));
  form.append('body', v.body);
  form.append('oneLine', v.oneLine);
  form.append('submit', String(v.submit));
  for (const p of photos) form.append('photos', p);
  return form;
}

export const articlesApi = {
  create: (v: ArticleFormValues, photos: File[]) =>
    api.post<MyPostView>('/posts/articles', articleForm(v, photos)),
  update: (id: number, v: ArticleFormValues, photos: File[]) =>
    api.patch<MyPostView>(`/posts/articles/${id}`, articleForm(v, photos)),
  /** ART-04: 최신순·엄지척순·영역·기자단 필터 */
  list: (
    p: { sort: 'latest' | 'likes'; tag?: string; reporter?: boolean },
    cursor?: string | null,
  ) => {
    const q = new URLSearchParams({ type: 'article', scope: 'school', sort: p.sort });
    if (p.tag) q.set('tag', p.tag);
    if (p.reporter) q.set('reporter', '1');
    if (cursor) q.set('cursor', cursor);
    return api.get<PostListPage<StudentPostView>>(`/posts?${q.toString()}`);
  },
};

export interface ReactionTarget {
  type: 'post' | 'news_topic';
  id: number;
}
const reactionsPath = (t: ReactionTarget) =>
  t.type === 'post' ? `/posts/${t.id}` : `/news/topics/${t.id}`;

export const reactionsApi = {
  reactions: (postId: number) => api.get<PostReactionsView>(`/posts/${postId}/reactions`),
  /** 8.1 일반화: 리포트·기사(post) / 토론 주제(news_topic) */
  reactionsOf: (t: ReactionTarget) => api.get<PostReactionsView>(`${reactionsPath(t)}/reactions`),
  addCommentTo: (t: ReactionTarget, body: string) =>
    api.post<CommentView>(`${reactionsPath(t)}/comments`, { body }),
  likePost: (postId: number, on: boolean) =>
    on
      ? api.post<LikeResult>(`/posts/${postId}/like`)
      : api.delete<LikeResult>(`/posts/${postId}/like`),
  likeComment: (commentId: number, on: boolean) =>
    on
      ? api.post<LikeResult>(`/comments/${commentId}/like`)
      : api.delete<LikeResult>(`/comments/${commentId}/like`),
  addComment: (postId: number, body: string) =>
    api.post<CommentView>(`/posts/${postId}/comments`, { body }),
  deleteComment: (commentId: number) => api.delete<{ deleted: boolean }>(`/comments/${commentId}`),
  report: (targetType: 'post' | 'comment', targetId: number, reason: string) =>
    api.post<ReportResult>('/reports', { targetType, targetId, reason }),
  attendance: () => api.get<AttendanceView>('/me/attendance'),
  readOpen: (t: ReactionTarget) =>
    api.post<{ tracked: boolean }>('/me/read/open', { targetType: t.type, targetId: t.id }),
  readComplete: (t: ReactionTarget) =>
    api.post<ReadResult>('/me/read/complete', {
      targetType: t.type,
      targetId: t.id,
      scrolledToEnd: true,
    }),
};
