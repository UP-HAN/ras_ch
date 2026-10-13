# 04-check-report — 정합성 점검 (consistency-checker, 2026-10-13)
기준: 01-spec 8장 + 00-decisions(초록 톤·글꼴 유지·사이트 전체·11번 시트·로고/아이콘 초롱이가 우선)

| 항목 | 결과 | 비고 |
|---|---|---|
| art PNG 01~10 이름·개수 | 통과 | 11-mascot-character-sheet.png 도 있음(결정 반영) |
| PNG 크기 | 통과 | 01~07,10 = 1024x1024 / 08,09,11 = 1536x1024 |
| webp 10개 이름·크기 | 통과 | 마스코트 512x512, 08·09 960x640 (logo-mascot.webp 96x96 추가분 있음) |
| webp 용량 | 통과 | 마스코트 최대 23KB, 08=104KB, 09=100KB, 합계 343KB |
| illustrations.ts 10경로 = 실제 파일 | 통과 | 1:1 일치 |
| 새 파일 존재(motion.css, motion.ts, celebrate.ts/test, fun/ 7개, convert 스크립트) | 통과 | gen-mascot-icons.mjs, favicon.png, 아이콘 3종(192/512/maskable 512) 크기 맞음 |
| 스크린샷 9장 (360px 7 + 1280px 2) | 반려 | outputs/code/screens/ 에 3장뿐(360-login, 1280-login, 360-login-reduced-motion). 로그인 필요한 7장 없음. 담당: coder (로그인 계정으로 촬영이 불가하면 메인이 그 사실을 사용자에게 알릴 것) |
| tokens.css 색 HEX | 통과(결정 우선) | sun/mint/sky/berry/grape 15개 값 명세와 동일. primary·accent·paper·line·gradient·shadow 는 03 보고서 표의 새 값과 일치. ink #1f2937 유지 |
| radius 10/14/20/28, text-base 1rem, tap 44px, tab-bar 64px | 통과 | |
| --font-display | 통과(결정 우선) | var(--font-sans) |
| 16px 미만 글자(text-xs/sm/[Npx]) 새로 추가 | 통과 | 0건 |
| Button min-h-tap·text-base, Button.test | 통과 | 테스트 298개 통과 |
| prefers-reduced-motion 블록 | 통과 | [class*='anim-'] animation/transition 끔 |
| 모션 14개 클래스/컴포넌트·길이 | 통과 | 03 보고서 3장 표와 명세 숫자 일치, 클래스 존재 확인 |
| img alt="" · width · height | 통과 | Mascot/Illustration/LanternLogo 모두 alt="", width, height 있음 |
| 3.1 새 문구 8개 | 통과 | 각 컴포넌트에 글자 그대로 존재, 반말 어미 없음 |
| PNG 글자·숫자 없음(눈으로 확인) | 미확인 | 이 점검에서 이미지를 열어 보지 않음. 02-art-report 에는 "글자 없음"으로 기록됨 |
| 새 npm 패키지 0개 | 통과 | git diff package.json·client/package.json 변경 없음 |
| server/ 변경 0건 | 통과 | git diff --stat server 비어 있음 |
| data-testid 삭제 0건 | 통과 | |
| "시연" 추가 0건 | 통과 | |
| sw.js VERSION | 통과 | ras-shell-v3 (결정 반영) |
| 03-code-report 기록 | 반려 | 7장이 "01만 변환 완료, 02~10 변환 대기, 01 은 주황"으로 적혀 있으나 실제는 webp 10개 존재·01 초록 재작성. 1장 "sw v2" 기재 vs 실제 v3. 보고서가 현재 상태와 다름. 담당: coder |
| 파일명 NN-설명.확장자 | 통과 | art·illustrations 모두 규칙 준수 |

검사 명령 결과
- npm run typecheck: 통과
- npm test: 36 파일, 298 테스트 통과
- npm run lint: 오류 없음
- npm run build(client): 이번 점검에서 다시 돌리지 않음(03 보고서 기록상 통과)

반려: 스크린샷 부족(coder), 03-code-report 현황 불일치(coder). codex-illustrator 반려 없음.
