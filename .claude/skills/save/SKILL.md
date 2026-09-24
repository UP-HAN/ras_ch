---
name: save
description: "작업 저장 — 지금까지의 변경을 정리해 docs/HANDOFF.md 를 갱신하고 커밋·푸시한다. 사용자가 '저장', '저장해줘', '/save' 라고 하면 실행"
---

다른 컴퓨터에서 이어서 작업할 수 있게 현재 상태를 GitHub(origin/main)에 올린다. 순서대로 한다.

1. `git status --short` 로 바뀐 파일을 본다. 아무것도 없으면 "저장할 변경이 없어요"라고 말하고 끝낸다.
2. `docs/HANDOFF.md` 를 갱신한다(있으면 덮어쓴다). 내용: 오늘 날짜, 지금 무엇을 하고 있었는지(3~5줄), 아직 안 끝난 일·다음에 할 일(체크리스트), 주의할 점(비밀값·서버 상태 등). 이 파일은 다음 컴퓨터에서 `/load` 가 가장 먼저 읽는다.
3. 빠른 검사: `npm run typecheck` 와 `npm run lint` 가 통과하면 그대로, 실패하면 실패 내용을 HANDOFF 의 "주의할 점"에 적고 계속 진행한다(저장 자체를 막지 않는다).
4. `git add -A` → 커밋 메시지는 CLAUDE.md 형식(`feat(...)`, `fix(...)`, `chore(...)`, `docs(...)`)으로 변경 내용을 한 줄로 요약하고, 마지막에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 를 붙인다. `.env`·`server/uploads` 같은 비밀·데이터는 .gitignore 로 빠져 있으니 절대 강제로 넣지 않는다.
5. `git push origin main`. 충돌하면 `git pull --rebase` 후 다시 푸시하고, 그래도 안 되면 사용자에게 상황을 알린다.
6. 마지막에 커밋 해시와 "다른 컴퓨터에서는 `/load` 라고 하세요"를 한 줄로 알려 준다.
