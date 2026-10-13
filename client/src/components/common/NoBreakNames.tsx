import { Fragment } from 'react';
import { splitNames } from '@/lib/nameSplit';

/**
 * 글 속의 학생 표시 이름을 한 덩어리(name-nowrap)로 묶어 이름이 중간에서 다음 줄로 넘어가지 않게 한다
 * (2026-10-13 사용자 요청 "줄바꿈 원칙"). 알림 메시지·자치회 작성자 표시처럼 이름이 문장에 섞여 있을 때 쓴다.
 */
export function NoBreakNames({ text }: { text: string }) {
  return (
    <>
      {splitNames(text).map((part, i) =>
        part.isName ? (
          <span key={i} className="name-nowrap">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
