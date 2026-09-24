---
name: load
description: "작업 불러오기 — GitHub 최신 코드를 받고 의존성·DB 를 맞춘 뒤 docs/HANDOFF.md 를 읽어 어디까지 했는지 요약한다. 사용자가 '불러와', '로드', '이어서', '/load' 라고 하면 실행"
---

다른 컴퓨터에서 저장한 작업을 이 컴퓨터에서 이어받는다. 순서대로 한다.

1. `git status --short` 로 이 컴퓨터에 커밋 안 한 변경이 있는지 본다. 있으면 사용자에게 알리고, 덮어써도 되는지 묻기 전에는 `git stash` 나 삭제를 하지 않는다.
2. `git pull origin main` (변경이 없으면 `--ff-only`).
3. `package-lock.json` 이 바뀌었으면 `npm install`. `server/migrations/` 에 새 파일이 있으면 `npm run db:migrate` (DB 가 안 떠 있으면 메모리의 "로컬 환경: Docker·MySQL 없음" 절차대로 포터블 MySQL 을 먼저 켠다. 이 컴퓨터에 그 절차가 없으면 `docs/SETUP-NEW-PC.md` 를 따른다).
4. `docs/HANDOFF.md` 와 `docs/PROGRESS.md` 의 마지막 항목, `CLAUDE.md` 를 읽는다.
5. 사용자에게 5줄 안으로 보고한다: 마지막 저장 날짜, 무엇을 하던 중이었는지, 다음에 할 일, 이 컴퓨터에서 아직 준비 안 된 것(.env 없음, MySQL 없음, 서버 SSH 키 없음 등). 그리고 "이어서 진행할까요?"라고 묻는다.
