// 실행: node --test scripts/decisions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecision } from './decisions.mjs';

const open = `### 결정 요청: 자동 저장 충돌을 어떻게 처리할까

- 상태: 대기
- 막힘: 아니오

**배경**: 두 기기에서 같은 글을 고치면 나중 저장이 앞의 것을 덮는다.

**선택지**
1. 나중 저장 우선 — 구현이 간단하지만 내용이 사라질 수 있다
2. 충돌 시 두 판본을 모두 보여주기 — 화면이 하나 더 필요하다

**권장**: 2 — 글이 사라지는 쪽이 더 큰 문제다

**결정**: 
`;

test('대기 중인 결정 요청을 읽는다', () => {
  assert.deepEqual(parseDecision(open), {
    question: '자동 저장 충돌을 어떻게 처리할까',
    status: 'waiting',
    blocking: false,
    recommended: '2 — 글이 사라지는 쪽이 더 큰 문제다',
    decision: '',
  });
});
test('결정된 댓글은 상태와 결정을 읽는다', () => {
  const done = open.replace('상태: 대기', '상태: 결정됨').replace('막힘: 아니오', '막힘: 예').replace('**결정**: ', '**결정**: 2 (2026-11-21)');
  const d = parseDecision(done);
  assert.equal(d.status, 'decided');
  assert.equal(d.blocking, true);
  assert.equal(d.decision, '2 (2026-11-21)');
});
test('일반 댓글과 본문 중간의 인용은 결정 요청이 아니다', () => {
  assert.equal(parseDecision('확인했습니다. 진행해 주세요.'), null);
  assert.equal(parseDecision('위 댓글 참고\n\n### 결정 요청: 인용'), null);
});
test('상태가 없거나 모르는 값이면 대기로 본다', () => {
  assert.equal(parseDecision('### 결정 요청: 질문\n\n- 상태: 보류').status, 'waiting');
});
test('영어 서식도 읽는다', () => {
  const d = parseDecision('### Decision needed: Ship Apple login in 1.0?\n\n- Status: Decided\n- Blocking: yes\n\n**Recommended**: Yes\n\n**Decision**: Yes (2026-11-21)');
  assert.deepEqual(d, { question: 'Ship Apple login in 1.0?', status: 'decided', blocking: true, recommended: 'Yes', decision: 'Yes (2026-11-21)' });
});
