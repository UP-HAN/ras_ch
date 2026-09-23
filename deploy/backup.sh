#!/usr/bin/env bash
# 백업 (PRD 10장 가용성): DB 일 1회, 이미지 주 1회, 30일 보관
#   crontab -e
#     10 3 * * *  /var/app/ras/deploy/backup.sh db      >> /var/log/ras-point/backup.log 2>&1
#     20 3 * * 0  /var/app/ras/deploy/backup.sh uploads >> /var/log/ras-point/backup.log 2>&1
# 환경: /var/app/ras/.env 의 DB_* 를 읽는다. 백업 파일에는 학생 정보가 들어 있으므로 권한 600 유지.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/app/ras}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ras-point}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# shellcheck disable=SC1091
set -a; source "$APP_DIR/.env"; set +a
mkdir -p "$BACKUP_DIR"
umask 077

case "${1:-db}" in
  db)
    OUT="$BACKUP_DIR/db-$STAMP.sql.gz"
    mysqldump --host="${DB_HOST:-127.0.0.1}" --port="${DB_PORT:-3306}" --user="$DB_USER" --password="$DB_PASSWORD" \
      --single-transaction --quick --routines --triggers "$DB_NAME" | gzip -9 > "$OUT"
    echo "[$(date '+%F %T')] db backup: $OUT ($(du -h "$OUT" | cut -f1))"
    find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
    ;;
  uploads)
    UPLOAD_DIR="${UPLOAD_DIR:-$APP_DIR/server/uploads}"
    OUT="$BACKUP_DIR/uploads-$STAMP.tar.gz"
    tar -czf "$OUT" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
    echo "[$(date '+%F %T')] uploads backup: $OUT ($(du -h "$OUT" | cut -f1))"
    find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
    ;;
  *)
    echo "usage: $0 db|uploads" >&2; exit 1 ;;
esac
