# 02-art-report — 초롱이 일러스트 (초록·연두·민트 톤)

## 변경 사실
- 처음 주황 톤으로 01을 만들었으나, 사용자 결정(초록·연두·민트 톤앤매너)에 따라 폐기하고 01을 초록 톤으로 다시 만들어 기준 이미지로 삼았다. 02~10은 모두 초록 톤 01을 `-i` 참고 이미지로 붙여 생성.
- 마스코트: 몸통 라임~민트 초록(#5CCB6B, #B7E86A), 뚜껑 진초록(#1F7A4D), 노란 불빛·금색 술 유지, 외곽선 #2E4A1E. 08·09 장면은 초록·민트 주색.
- 명세 01-spec 5.2의 주황 캐릭터 문장·팔레트는 초록 문장으로 대체됨(아래 프롬프트).
- 추가 요청: 11번 마스터 캐릭터 시트 1장 (보관용, 화면 미사용).

## 파일 (outputs/art/)
| 파일 | 크기 | 재생성 | 메모 |
|---|---|---|---|
| 01-mascot-hello | 1024x1024 | 톤 변경으로 1회 | 기준. 글자 없음 |
| 02-mascot-cheer | 1024x1024 | 0 | 캐릭터 일치 |
| 03-mascot-sleep | 1024x1024 | 0 | 글자 없음(물결선) |
| 04-mascot-think | 1024x1024 | 0 | 말풍선 비어 있음 |
| 05-mascot-write | 1024x1024 | 0 | 여백이 조금 좁음 |
| 06-mascot-trophy | 1024x1024 | 0 | Codex 원본 1254x1254 를 sharp 로 1024 축소(그림 수정 아님) |
| 07-mascot-oops | 1024x1024 | 0 | |
| 08-login-hero | 1536x1024 | 0 | 밤하늘+초록 등불, 글자 없음. 학교 건물은 오른쪽 |
| 09-activities | 1536x1024 | 0 | 밝은 낮 장면. 하늘 파랑·옷 분홍 포인트 |
| 10-mascot-shine | 1024x1024 | 0 | 씨앗·새싹·꽃·사과·별 |
| 11-mascot-character-sheet | 1536x1024 | 1회 (첫 판에 Z·느낌표 글자 모양 있어 재생성) | 표정 8 + 턴어라운드 5 + 동작 6, 글자 없음, 크림 배경 |

## 캐릭터 일관성
01~10, 11 모두 같은 형태(뚜껑 2개, 위 고리, 금색 술, 초록 몸통, 분홍 볼). 고리가 뚜껑 위 금색 고리로 그려짐(주황판 구슬 대신) — 전 장 동일.

## 프롬프트 (공통)
- 캐릭터: `the mascot "Chorong-i": a small cute round Korean paper lantern character (cheongsachorong-inspired), fresh green body in lime-to-mint green tones (#5CCB6B and #B7E86A) glowing softly with warm yellow light (#FFD84D) from inside, short deep green caps (#1F7A4D) on top and bottom, a tiny golden tassel hanging below, big round black eyes with white highlights, rosy pink cheeks, a small happy smile, short stubby arms and tiny feet in matching green, chibi proportions about two heads tall`
- 스타일: `Style: cute flat vector-style children's picture-book illustration, soft rounded shapes, clean thick dark green-brown outlines (#2E4A1E), gentle soft shading, overall tone and manner in fresh green, light lime and mint (#5CCB6B, #B7E86A, #3CCF9A, #DFF7D8) as the dominant colors, with warm yellow #FFD84D light as accent and only tiny small touches of pink #FF6FA3 and sky blue #4FB3FF, friendly happy mood for Korean elementary school kids aged 9 to 12. Absolutely no text, no letters, no Korean or English characters, no numbers, no logos, no watermark, no signature.`
- 마스코트 배경: 01-spec 5.2 흰 배경 문장 그대로. 02~11 앞에: `First look at the attached reference image 01-mascot-hello.png and keep exactly the same character design and green color tone.`
- 그림별 본문은 01-spec 5.3 과 같고, 08 은 "deep teal-green to dark blue night sky ... green and yellow paper lanterns ... lush green field", 09 는 "Fresh green and mint dominant colors" 로 초록 톤 반영. 11 본문은 표정/턴어라운드/동작 3줄 구성 + "no labels, no captions, no letters (not even Z)".

## 제안
- 호출 메모: `codex exec` 는 백그라운드에서 stdin 을 기다리며 멈추므로 `< /dev/null` 필요. `-i` 는 여러 값을 먹으므로 프롬프트 뒤에 둬야 함. Codex 원본 크기가 1254 로 나올 수 있어 크기 확인 필수.

## RAS 추가분 (2026-10-13)
| 파일 | 크기 | 재생성 | 메모 |
|---|---|---|---|
| 12-ras-reading | 1024x1024 | 0 | 나무 아래 책 읽는 초롱이, 글자 없음 |
| 13-ras-art | 1024x1024 | 0 | 이젤·팔레트·붓 |
| 14-ras-sports | 1024x1024 | 0 | Codex 원본 1254 를 sharp 로 1024 축소 |
| 15-icon-reading | 1024x1024 | 0 | 펼친 책, 빈 물결선 |
| 16-icon-art | 1024x1024 | 0 | 팔레트+붓 |
| 17-icon-sports | 1024x1024 | 0 | 축구공+줄넘기 |

프롬프트: 위 공통 캐릭터·스타일 문장 재사용(01·11 을 `-i` 참조). 장면 본문:
- 12: sitting under a leafy green tree reading an open picture book, soft grass, falling leaves
- 13: standing at a wooden easel painting, brush in one hand, palette in the other, small paint dots
- 14: dribbling and kicking a soccer ball while running, hint of green playground with white line
- 아이콘 공통: `Simple sticker-style icon on a plain white background, single centered object, very thick dark green-brown outline (#2E4A1E, same thick stroke width), flat green shading, a soft darker green (#2F9E5A) drop shadow below, object fills about 75 percent, matching set of three icons. No character.` + 15 open book with bookmark ribbon (blank wavy lines) / 16 paint palette with brush / 17 soccer ball with coiled jump rope
