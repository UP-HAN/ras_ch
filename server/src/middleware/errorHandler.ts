import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, fail } from '../lib/apiResponse.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(fail('NOT_FOUND', '요청한 주소를 찾을 수 없어요.'));
};

// express는 인자 4개여야 에러 핸들러로 인식한다(_next 는 그래서 남겨 둔다)
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(fail(err.code, err.message, err.details));
    return;
  }
  // express.json 파싱 오류 등
  const status =
    typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;
  if (status >= 500) {
    logger.error({ err, url: req.originalUrl, method: req.method }, 'unhandled error');
    res.status(500).json(fail('INTERNAL', '문제가 생겼어요. 잠시 후 다시 해 주세요.'));
    return;
  }
  res.status(status).json(fail('BAD_REQUEST', '요청 내용을 읽을 수 없어요. 다시 확인해 주세요.'));
};
