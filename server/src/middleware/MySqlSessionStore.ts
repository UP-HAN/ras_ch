/**
 * express-session 용 MySQL 세션 저장소 (sessions 테이블은 migrations/002_sessions.sql).
 * 외부 스토어 패키지 대신 우리 풀을 그대로 써서 mysql2 버전을 하나로 유지한다.
 */
import session, { type SessionData } from 'express-session';
import { execute, queryOne } from '../db/query.js';

interface SessionRow {
  session_id: string;
  expires: number;
  data: string;
}

const DEFAULT_TTL_SEC = 30 * 24 * 60 * 60; // 30일 (AUTH-01)

export class MySqlSessionStore extends session.Store {
  private readonly ttlSec: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(opts: { ttlSec?: number; cleanupIntervalMs?: number } = {}) {
    super();
    this.ttlSec = opts.ttlSec ?? DEFAULT_TTL_SEC;
    const interval = opts.cleanupIntervalMs ?? 60 * 60 * 1000;
    if (interval > 0) {
      this.cleanupTimer = setInterval(() => void this.clearExpired(), interval);
      this.cleanupTimer.unref();
    }
  }

  private expiresAt(sess: SessionData): number {
    const cookieExpires = sess.cookie?.expires;
    const ms = cookieExpires ? new Date(cookieExpires).getTime() : Date.now() + this.ttlSec * 1000;
    return Math.floor(ms / 1000);
  }

  override get(sid: string, cb: (err: unknown, sess?: SessionData | null) => void): void {
    queryOne<SessionRow>('SELECT session_id, expires, data FROM sessions WHERE session_id = ?', [
      sid,
    ])
      .then((row) => {
        if (!row) return cb(null, null);
        if (row.expires <= Math.floor(Date.now() / 1000)) return cb(null, null);
        cb(null, JSON.parse(row.data) as SessionData);
      })
      .catch((err) => cb(err));
  }

  override set(sid: string, sess: SessionData, cb?: (err?: unknown) => void): void {
    const data = JSON.stringify(sess);
    execute(
      `INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
      [sid, this.expiresAt(sess), data],
    )
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  override destroy(sid: string, cb?: (err?: unknown) => void): void {
    execute('DELETE FROM sessions WHERE session_id = ?', [sid])
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  override touch(sid: string, sess: SessionData, cb?: (err?: unknown) => void): void {
    execute('UPDATE sessions SET expires = ? WHERE session_id = ?', [this.expiresAt(sess), sid])
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  async clearExpired(): Promise<void> {
    try {
      await execute('DELETE FROM sessions WHERE expires <= ?', [Math.floor(Date.now() / 1000)]);
    } catch {
      // 정리 실패는 다음 주기에 다시 시도
    }
  }

  close(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}
