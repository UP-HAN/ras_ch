# 배포 절차 (Lightsail Ubuntu, PRD 11장)

대상 서버: 기존 Lightsail 인스턴스(학급 STATUS 와 공유, `ssh ras-server`), Node 20, MySQL 8, nginx, pm2 설치됨. 포트 **3300**, 서브도메인 `ras.ches.es.kr`(hosting.kr DNS 에 A 레코드 → 서버 IP).

## 1. 최초 1회

```bash
# 코드
sudo mkdir -p /var/app/ras /var/log/ras-point /var/backups/ras-point && sudo chown -R $USER /var/app/ras /var/log/ras-point /var/backups/ras-point
git clone https://github.com/UP-HAN/ras_ch.git /var/app/ras && cd /var/app/ras
npm ci

# MySQL: 별도 스키마 + 전용 계정 (루트로 접속해서)
#   CREATE DATABASE ras_point CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
#   CREATE USER 'ras'@'localhost' IDENTIFIED BY '<강한 비밀번호>';
#   GRANT ALL ON ras_point.* TO 'ras'@'localhost';

# 환경 변수 (비밀값은 절대 커밋하지 않는다)
cp .env.example .env && nano .env
#   NODE_ENV=production  PORT=3300  DB_*  SESSION_SECRET(32자+)  UPLOAD_DIR=/var/app/ras/server/uploads  CLIENT_ORIGIN=https://ras.ches.es.kr
chmod 600 .env

npm run db:migrate            # server/migrations 적용
# 시범 명단(6학년 1~8반·교사 8명·학생 58명)으로 시작하려면 한 번만 (production 가드를 잠시 넘긴다):
#   NODE_ENV=development npm run db:seed
# 빈 상태로 시작하면 시드 대신 아래 3 의 관리자 1명만 넣는다
# 빌드는 서버 RAM(914MB)이 작아 로컬 PC 에서 한다: 로컬에서 `npm run build` 뒤
#   tar czf - server/dist client/dist | ssh ras-server "cd /var/app/ras && rm -rf server/dist client/dist && tar xzf -"

# pm2
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup   # 재부팅 시 자동 시작

# nginx + HTTPS
sudo cp deploy/nginx/ras.ches.es.kr.conf /etc/nginx/sites-available/ras.ches.es.kr
sudo ln -s /etc/nginx/sites-available/ras.ches.es.kr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ras.ches.es.kr

# 백업 cron (deploy/backup.sh 상단 참고)
chmod +x deploy/backup.sh && crontab -e
```

## 2. 확인

- `curl -s https://ras.ches.es.kr/healthz` → `{"ok":true,"data":{"status":"ok","db":"ok"}}`
- `pm2 logs ras-point --lines 50` 에 "초롱 RAS 포인트 서버 시작" 과 배치 등록 7건(weeklyTop·monthlyDraft·recountCaches·autoEscalate·newsReserve·newsPublish·councilExpire)
- 브라우저: 로그인 화면, PWA 설치 배너(HTTPS + manifest + sw)

## 3. 최초 관리자 계정

시드를 쓰지 않으므로 관리자 1명을 직접 만든다(비밀번호 해시는 bcrypt, 첫 로그인 시 변경 강제):

```bash
cd /var/app/ras/server && node -e "
const b=require('bcryptjs');console.log(b.hashSync(process.argv[1],10))" '임시비밀번호12!'
# 출력된 해시로
#   INSERT INTO users (login_id,password_hash,role,is_approver,name,display_name,must_change_pw)
#   VALUES ('admin@ches.es.kr','<해시>','admin',1,'관리자','관리자',1);
#   INSERT INTO school_years (year,start_date,end_date,is_current) VALUES (2026,'2026-03-01','2027-02-28',1);
```

그다음 관리자 화면에서 학년도·반·교사·학생 CSV·규칙표(기본값은 `scripts/seed.ts` 의 RULES 참고)·설정을 등록한다.

## 4. 업데이트 배포

```bash
# 로컬: npm run build && tar czf - server/dist client/dist | ssh ras-server "cd /var/app/ras && rm -rf server/dist client/dist && tar xzf -"
cd /var/app/ras && git pull && npm ci && npm run db:migrate && pm2 reload ras-point
```

야간에 배포한다(평일 07:00~22:00 무중단 목표). 마이그레이션은 추가 전용(ALTER ADD)만 두었으므로 롤백은 `git checkout <이전 태그> && npm run build && pm2 reload` 로 충분하다.

## 5. 서버 자원 주의

RAM 914MB 를 다른 앱과 나눠 쓴다. `max_memory_restart 300M`, `instances 1`. 이미지 리사이즈(sharp)가 순간 메모리를 쓰므로 동시 업로드가 많은 일요일 저녁에 `pm2 monit` 으로 확인한다. 디스크는 학기당 약 8GB(11.1) 를 감안해 Lightsail 스토리지 디스크를 `/var/app/ras/server/uploads` 에 마운트한다.

## 6. 시범 명단 → 실제 명단 교체

관리자 화면 **학생 관리**에서 반을 고르고 "이 반 학생 모두 지우기"(활동 기록이 없는 학생만 지워지고, 글·포인트가 있는 학생은 상태를 "중지"로 바꾼다) → **학생 CSV 등록**으로 실제 명단을 올린다. 더미 교사는 **학교 설정 › 교사**의 "삭제"로 지우고, 새 운영자(교사·관리자)는 같은 화면 "교사 추가"로 만든다(초기 비밀번호는 그때 한 번만 표시). 반 담임은 **학교 설정 › 반**에서 다시 배정한다.
