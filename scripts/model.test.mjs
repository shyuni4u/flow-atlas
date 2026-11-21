// 실행: node --test scripts/model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel, linksOf, taskProgress } from './model.mjs';

const { ia, issues, prs, repo } = JSON.parse(readFileSync(new URL('../dashboard/sample-input.ko.json', import.meta.url), 'utf8'));
const model = buildModel(ia, issues, prs, '2026-11-21T00:00:00Z', repo);
const flow = (key) => model.areas.flatMap((a) => a.flows.map((f) => [`${a.id}/${f.id}`, f])).find(([k]) => k === key)[1];

test('PR 본문에서 관계를 읽고 주석과 코드 블록은 무시한다', () => {
  assert.deepEqual(linksOf('Closes #3, refs #4\n<!-- Fixes #9 -->\n```\nCloses #10\n```\n'), [{ number: 3, relation: 'closes' }, { number: 4, relation: 'refs' }]);
});
test('빈 체크박스 서식은 작업 항목으로 세지 않는다', () => {
  assert.deepEqual(taskProgress('- [x] 화면\n- [ ] 저장\n- [ ] \n'), { done: 1, total: 2 });
});
test('이슈 진행은 체크박스, 닫힌 이슈는 100%로 계산한다', () => {
  const write = flow('editor/write');
  assert.equal(write.issues[0].progress, 3 / 5);
  assert.equal(write.status, 'doing');
  assert.equal(flow('home/list').progress, 1);
  assert.equal(flow('home/list').status, 'done');
});
test('흐름 진행은 이슈 평균, 영역과 전체는 범위 안 흐름의 평균이다', () => {
  assert.equal(flow('login/signup').progress, (1 + 2 / 3) / 2);
  const editor = model.areas.find((a) => a.id === 'editor');
  assert.equal(editor.progress, (3 / 5 + 1 / 3) / 2);
  assert.equal(flow('editor/ai-draft').status, 'out');
  assert.deepEqual(model.counts, { done: 2, doing: 4, todo: 3, out: 2 });
});
test('연결이 끊긴 곳을 찾는다', () => {
  assert.deepEqual(model.gaps.issuesWithoutPr.map((i) => i.number), [9, 12, 18]);
  assert.deepEqual(model.gaps.prsWithoutIssue.map((p) => p.number), [33, 37]);
  assert.equal(model.gaps.prsWithoutIssue[0].reason, '월간 정기 업데이트');
  assert.deepEqual(model.gaps.prsWithoutEvidence.map((p) => p.number), [36]);
  assert.deepEqual(model.gaps.issuesWithoutFlow.map((i) => i.number), [41]);
});
test('대기 중인 질문만 모으고 막힌 질문을 먼저 제안한다', () => {
  assert.deepEqual(model.openDecisions.map((d) => d.where), ['#4', 'PR #36']);
  assert.equal(model.next.kind, 'answer');
  assert.equal(flow('editor/write').issues[0].decisions.length, 1);
});
test('저장소 이름과 설명을 싣고, 없으면 비워 둔다', () => {
  assert.equal(model.repo.name, 'example/writing-app');
  assert.equal(buildModel(ia, issues, prs, '2026-11-21T00:00:00Z').repo, null);
  assert.equal(buildModel(ia, issues, prs, '', { nameWithOwner: 'a/b', description: null }).repo.description, '');
});
test('영어 서식으로 쓴 저장소도 같은 결과가 나온다', () => {
  const en = JSON.parse(readFileSync(new URL('../dashboard/sample-input.en.json', import.meta.url), 'utf8'));
  const m = buildModel(en.ia, en.issues, en.prs, '2026-11-21T00:00:00Z', en.repo);
  assert.equal(m.lang, 'en');
  assert.equal(m.progress, model.progress);
  assert.deepEqual(m.counts, model.counts);
  assert.deepEqual(m.gaps.prsWithoutEvidence.map((p) => p.number), [36]);
  assert.equal(m.gaps.prsWithoutIssue[0].reason, 'monthly routine update');
  assert.deepEqual(m.openDecisions.map((d) => d.where), ['#4', 'PR #36']);
});
