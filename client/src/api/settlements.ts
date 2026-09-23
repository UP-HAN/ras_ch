import type {
  ConfirmSettlementInput,
  ConfirmSettlementResult,
  SettlementView,
} from '@server-types/api';
import { api } from './client';

/** 월간 결산 (HOF-02~05, ADM-03). 승인 권한 교사 */
export const settlementsApi = {
  get: (month: string) => api.get<SettlementView>(`/admin/settlements/${month}`),
  draft: (month: string) => api.post<SettlementView>(`/admin/settlements/${month}/draft`),
  confirm: (month: string, input: ConfirmSettlementInput) =>
    api.post<ConfirmSettlementResult>(`/admin/settlements/${month}/confirm`, input),
  giftListUrl: (month: string) => `/api/v1/admin/settlements/${month}/gift-list.csv`,
};
