#!/usr/bin/env bash
# 시연 인스턴스(/var/app/ras-demo) 데이터 다시 만들기
#   ./deploy/demo-refresh.sh            → 오늘 기준 6주치 가상 활동을 새로 생성 (약 15분)
#   ./deploy/demo-refresh.sh snapshot   → 보관해 둔 스냅샷(/var/backups/ras-point/showcase/최신) 그대로 복원 (약 1분)
# 운영(ras-point, ras_point DB)에는 절대 손대지 않는다. 이 스크립트는 ras-demo 디렉터리의 .env(ras_demo DB)만 읽는다.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/app/ras-demo}"
SNAP_DIR="${SNAP_DIR:-/var/backups/ras-point/showcase}"
cd "$APP_DIR"
DB_NAME="$(grep '^DB_NAME=' .env | cut -d= -f2-)"
if [ "$DB_NAME" != "ras_demo" ]; then
  echo "!! $APP_DIR/.env 의 DB_NAME 이 ras_demo 가 아닙니다($DB_NAME). 운영 DB 보호를 위해 중단합니다." >&2
  exit 1
fi
DB_USER="$(grep '^DB_USER=' .env | cut -d= -f2-)"
DB_PASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)"

case "${1:-fresh}" in
  fresh)
    NODE_ENV=development npm run db:seed -- --force
    rm -rf server/uploads/*
    NODE_ENV=development npm run db:seed:showcase
    ;;
  snapshot)
    SQL="$(ls -t "$SNAP_DIR"/ras_point-showcase-*.sql.gz | head -1)"
    UP="$(ls -t "$SNAP_DIR"/uploads-showcase-*.tgz | head -1)"
    echo "복원: $SQL / $UP"
    gunzip -c "$SQL" | mysql -u"$DB_USER" -p"$DB_PASSWORD" -h127.0.0.1 "$DB_NAME"
    rm -rf server/uploads/*
    tar xzf "$UP" -C server
    ;;
  *)
    echo "사용법: $0 [fresh|snapshot]" >&2
    exit 1
    ;;
esac
pm2 reload ras-demo >/dev/null 2>&1 || true
echo "[$(date '+%F %T')] demo refresh (${1:-fresh}) 완료"
