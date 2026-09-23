# 초롱 RAS 포인트

초롱초등학교 3~6학년 폰프리·RAS 활동 포인트 웹앱.

- 요구사항: `docs/PRD.md` / 배경·운영: `docs/PLAN.md`
- 1차 개발 작업 목록: `docs/TASKS-phase1.md` / 진행 기록: `docs/PROGRESS.md`
- Claude Code 지침: `CLAUDE.md`, 첫 프롬프트: `docs/START-PROMPTS.md`
- 토론 주제 시드(2차용): `docs/seed/topic-bank-seed.json`

## 구성

```
client/   React 18 + Vite + TypeScript + Tailwind v4 (모바일 우선 학생 화면, PC 우선 교사 화면)
server/   Node 20+ + Express 5 + TypeScript, REST /api/v1, 세션 쿠키, MySQL 8 (mysql2 + SQL 직접)
scripts/  개발용 스크립트(시드, 학생 CSV 예시)
docs/     PRD, 기획서, 작업 목록, 진행 기록
```

## 실행 순서

### 최초 1회

```bash
cp .env.example .env                  # DB 접속·SESSION_SECRET 등을 채운다
docker compose up -d mysql            # 로컬 MySQL 8 (스키마 ras_point). Docker가 없으면 아래 참고
npm install                           # 루트(workspaces: client, server)
npm run db:migrate                    # server/migrations/*.sql 적용
npm run db:seed                       # 시범용 반·교사·학생 30명 + 규칙표 + 설정
```

Docker 없이 로컬 MySQL 8을 직접 쓰는 경우: `ras_point` 스키마와 계정을 만든 뒤 `.env`의 `DB_*` 값만 맞추면 된다.
마이그레이션·시드는 `mysql` CLI 없이 Node만으로 동작한다.

```sql
CREATE DATABASE ras_point CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'ras'@'%' IDENTIFIED BY 'ras_dev_password';
GRANT ALL ON ras_point.* TO 'ras'@'%';
```

### 개발

```bash
npm run dev            # client(5173) + server(3000) 동시 실행. /api, /uploads 는 Vite가 3000으로 프록시
npm test               # vitest 전체 (client + server)
npm run lint           # eslint
npm run typecheck      # tsc (client + server)
npm run format         # prettier
```

- 서버 헬스체크: `GET http://localhost:3000/healthz` → `{ ok: true, data: { status: 'ok', db: 'ok' } }`
- 학생 화면: `http://localhost:5173/` / 교사 화면: `http://localhost:5173/teacher`

### DB 관련

```bash
npm run db:migrate:status   # 적용 여부 표시
npm run db:seed -- --force  # 전 테이블 비우고 다시 시드 (개발 전용)
npm run db:reset            # 스키마 DROP → 마이그레이션 → 시드 (개발 전용, DB_ROOT_PASSWORD 필요)
```

시드 계정 (첫 로그인 시 비밀번호 변경 강제):

| 계정                                 | ID                                          | 초기 비밀번호  |
| ------------------------------------ | ------------------------------------------- | -------------- |
| 관리자(승인 권한, 6-1 담임)          | `admin@ches.es.kr`                          | `teacher1234!` |
| 3-1 / 4-1(3-4학년군 지도) / 5-1 담임 | `t3@` `t4@` `t5@ches.es.kr`                 | `teacher1234!` |
| 학생 30명                            | `263101` ~ `266107` (학년도2·학년·반·번호2) | `1234`         |

## 규칙 요약 (자세한 것은 CLAUDE.md)

- 포인트는 `point_ledger`에만 기록하고 합계 컬럼을 두지 않는다. 지급·회수는 `PointService`만 거친다.
- 권한은 서버에서 검사한다. 학생용 응답에는 실명이 없고, 학생 검토자 응답에는 작성자 식별 정보가 없다(`server/src/lib/serializers`).
- 서버 시각은 Asia/Seoul, 주차 키는 ISO 8601(`2026-W38`).
