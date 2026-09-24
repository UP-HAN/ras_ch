# 다른 컴퓨터에서 이어서 작업하기

코드는 GitHub `https://github.com/UP-HAN/ras_ch` 에 있다. 두 컴퓨터를 오가며 작업하는 규칙은 하나다:
**끝낼 때 Claude 에게 "저장"(`/save`), 시작할 때 "불러와"(`/load`).**

## 1. 새 컴퓨터 준비 (최초 1회)

1. Git, Node.js 20, Claude Code(VS Code 확장 또는 CLI) 설치. GitHub 에 로그인된 상태(`gh auth login` 또는 Git 자격 증명).
2. 저장소 받기
   ```bash
   git clone https://github.com/UP-HAN/ras_ch.git
   cd ras_ch
   npm install
   ```
3. `.env` 만들기: `cp .env.example .env` 후 값 채우기 (로컬 개발용 기본값은 그대로 두면 됨). `.env` 는 git 에 올라가지 않으므로 컴퓨터마다 따로 만든다.
4. MySQL 8: Docker 가 있으면 `docker compose up -d mysql`. 없으면 MySQL 8 zip(포터블)을 받아 `ras_point` 스키마와 `ras / ras_dev_password` 계정을 만든다(이 컴퓨터의 Claude 메모리 "로컬 환경: Docker·MySQL 없음"에 절차가 있음. 다른 컴퓨터에서는 Claude 에게 "포터블 MySQL 로 로컬 DB 준비해 줘"라고 하면 된다).
5. 스키마·데이터
   ```bash
   npm run db:migrate
   npm run db:seed              # 시범 명단(6학년 1~8반)  /  --minimal: 관리자만
   npm run db:seed:showcase     # (선택) 시연 데이터 6주치
   npm run dev                  # http://localhost:5173
   ```
6. (선택) 운영 서버 배포까지 하려면 `~/.ssh/config` 에 `Host ras-server` 항목과 Lightsail pem 키를 이 컴퓨터에도 복사한다. 키는 git 에 넣지 않는다.

## 2. 매일 쓰는 방법

- 시작: Claude 에게 **"불러와"** 또는 `/load` → 최신 코드 pull, 의존성·마이그레이션 적용, `docs/HANDOFF.md` 요약.
- 끝: Claude 에게 **"저장"** 또는 `/save` → HANDOFF 갱신, 커밋, 푸시.
- 두 컴퓨터에서 동시에 고치지 않는다. 한쪽에서 저장하기 전에 다른 쪽에서 시작하면 충돌이 난다.

## 3. Claude 가 기억하는 것 vs 저장소에 있는 것

- 저장소(둘 다 공유): 코드, `CLAUDE.md`(규칙), `docs/PROGRESS.md`(진행 기록), `docs/HANDOFF.md`(인수인계), `.claude/skills/`(save/load 트리거).
- 컴퓨터마다 따로: Claude 의 개인 메모리(서버 접속 방법, 로컬 MySQL 절차 등), `.env`, SSH 키, `server/uploads`. 새 컴퓨터에서 Claude 가 서버·DB 절차를 모르면 이 문서와 `deploy/README.md` 를 보라고 하면 된다.
