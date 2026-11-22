// 실행: node --test scripts/label-issue.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelPlan } from './label-issue.mjs';
import { listFlows } from './lib.mjs';

const flows = listFlows({ areas: [
  { id: 'login', name: '가입·로그인', flows: [{ id: 'signup', name: '처음 가입하기', scope: 'in' }, { id: 'reset', name: '비밀번호 찾기', scope: 'out' }] },
  { id: 'home', name: '홈', flows: [{ id: 'list', name: '목록 보기', scope: 'in' }] },
] });
const form = (key) => `### 흐름\n\n가입·로그인 › 처음 가입하기 (${key})\n\n### 작업 항목\n\n- [ ] 화면\n`;
const plan = (body, current) => { const { want, add, remove } = labelPlan(body, current, flows); return { want, add, remove }; };

test('양식의 흐름 선택으로 영역·흐름 라벨을 붙인다', () => {
  assert.deepEqual(plan(form('login/signup'), []), { want: ['area:login', 'flow:login/signup'], add: ['area:login', 'flow:login/signup'], remove: [] });
  assert.deepEqual(plan('### Flow\r\n\r\nLogin › Sign up (login/signup)\r\n', ['needs-flow']).remove, ['needs-flow']);
});
test('흐름을 알 수 없으면 needs-flow 를 붙인다', () => {
  assert.deepEqual(plan('본문만 있다', ['bug']), { want: ['needs-flow'], add: ['needs-flow'], remove: [] });
  assert.deepEqual(plan(null, ['needs-flow']), { want: ['needs-flow'], add: [], remove: [] });
});
test('양식 없이 만든 이슈에 손으로 붙인 흐름 라벨을 지우지 않는다', () => {
  assert.deepEqual(plan('본문만 있다', ['bug', 'flow:home/list']), { want: ['area:home', 'flow:home/list'], add: ['area:home'], remove: [] });
  assert.deepEqual(plan('본문만 있다', ['flow:home/list', 'area:home']), { want: ['area:home', 'flow:home/list'], add: [], remove: [] });
  assert.deepEqual(plan('본문만 있다', ['needs-flow', 'flow:home/list', 'area:login']).remove, ['needs-flow', 'area:login']);
});
test('본문의 선택이 손으로 붙인 라벨보다 우선한다', () => {
  assert.deepEqual(plan(form('login/signup'), ['area:home', 'flow:home/list']), { want: ['area:login', 'flow:login/signup'], add: ['area:login', 'flow:login/signup'], remove: ['area:home', 'flow:home/list'] });
});
test('정본에 없는 흐름 라벨은 따르지 않고 뗀다', () => {
  assert.deepEqual(plan('본문만 있다', ['flow:old/gone']), { want: ['needs-flow'], add: ['needs-flow'], remove: ['flow:old/gone'] });
  assert.deepEqual(plan(form('old/gone'), ['flow:home/list']).want, ['area:home', 'flow:home/list']);
  assert.deepEqual(plan('본문만 있다', ['flow:old/gone', 'flow:home/list', 'flow:login/reset']), { want: ['area:home', 'flow:home/list'], add: ['area:home'], remove: ['flow:old/gone', 'flow:login/reset'] });
});
