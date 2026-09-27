# 작업 인수인계 (HANDOFF)

`/save` 가 갱신하고 `/load` 가 가장 먼저 읽는 파일. 어느 컴퓨터에서든 여기부터 본다.

## 마지막 저장: 2026-09-27

### 지금까지 한 것

- 1차(S0~S5)·2차(P2-1 토론방, P2-2 자치회·주간 선물, P2-3 등급·칭호·미션) 전부 구현·배포됨. 상세는 `docs/PROGRESS.md`.
- 2026-09-27: 교사 화면 QA 수정 22건 + 모바일 표 깨짐 수정(표 최소 너비·가로 스크롤, 댓글/글/학생은 카드)(`fix/ras-teacher-qa-fix-spec.md`) 완료·배포 — 확인 모달, 교사용 글 상세(`/teacher/posts/:id`), 대기함 기사 포함·집계 통일(`PendingService`), 신고 그룹화, 페이지네이션, 금칙어 삭제, 문구·접근성. PROGRESS 2026-09-27 항목 참고.
- 운영 사이트 https://ras.ches.es.kr 는 **관리자 1명 + 6-1 반**만 있는 초기 상태. 교사·학생은 관리자 화면에서 등록.
- 시연 사이트 https://ras1.ches.es.kr 에 6주치 가상 데이터(학생 58명)가 살아 있음. 운영 관리자 메뉴 맨 아래 링크로만 연결. 화면에 시연 표시는 절대 넣지 않는다(사용자 지시).
- 사이트 원칙: 모든 글·댓글·안내 문구는 **존댓말** (CLAUDE.md 절대 규칙 9).

### 다음에 할 일

- [ ] 10월 중순 정식 운영 전: 사용자가 교사·학생 등록 → 필요하면 학생 CSV 형식 안내
- [ ] `docs/TASKS-phase2.md` 8-2(학급 보상 문구 확인)·8-3(성능 재측정, 전체 CSV 등록, 오픈 체크리스트)
- [ ] 시연 전 ras1 데이터 새로 고침이 필요하면 서버에서 `./deploy/demo-refresh.sh` (deploy/README 8절). `snapshot` 모드는 2026-09-24 스냅샷이라 QA 데이터 정리(류다은 비밀번호·자치회 날짜)가 되돌아가니 `fresh` 권장.

### 주의할 점

- 서버(Lightsail, `ssh ras-server`)의 다른 앱(class-backend, class_tool DB, 다른 nginx 사이트)은 절대 건드리지 않는다.
- 서버에서 빌드하지 않는다(RAM 914MB). 로컬에서 `npm run build` 후 dist 만 업로드 → `pm2 reload ras-point` / `ras-demo`.
- `.env`(로컬·서버)와 SSH 키는 git 에 없다. 새 컴퓨터는 `docs/SETUP-NEW-PC.md` 참고.
- 로컬 포터블 MySQL 은 임시 폴더에 있어 바이너리가 지워질 수 있다(zip 은 남음). 이번에 zip 에서 다시 풀어 썼다.
