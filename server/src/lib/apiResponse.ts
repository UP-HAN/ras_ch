/**
 * API 응답 규격: { ok: true, data } | { ok: false, error: { code, message } }
 * 에러 메시지는 학생이 읽을 수 있는 한국어로 쓴다.
 */
export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiFail {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export type ApiResponse<T> = ApiOk<T> | ApiFail;

export function ok<T>(data: T): ApiOk<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiFail {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}

/** 라우트·서비스에서 던지는 표준 예외. errorHandler가 응답으로 바꾼다. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = '로그인이 필요해요.'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = '이 기능을 사용할 권한이 없어요.'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = '찾을 수 없어요.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, 'CONFLICT', message);
  }

  static notImplemented(message = '아직 준비 중인 기능이에요.'): AppError {
    return new AppError(501, 'NOT_IMPLEMENTED', message);
  }
}
