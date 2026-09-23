/**
 * CSV 출력 (TCH-05, HOF-02 선물 명단): UTF-8 BOM + CRLF + RFC 4180 이스케이프. 엑셀에서 한글이 깨지지 않는다.
 */
import type { Response } from 'express';

export type CsvCell = string | number | null | undefined;

export function csvEscape(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: CsvCell[][]): string {
  return (
    String.fromCharCode(0xfeff) + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n'
  );
}

export function sendCsv(res: Response, filename: string, rows: CsvCell[][]): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(toCsv(rows));
}
