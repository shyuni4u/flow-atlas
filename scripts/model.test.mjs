// 실행: node --test scripts/model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildModel, linksOf, taskProgress } from './model.mjs';
import { loadIa } from './lib.mjs';

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
test('도입 기준일보다 먼저 만든 PR은 끊긴 연결로 세지 않는다', () => {
  const dated = [
    { number: 1, title: '예전', state: 'MERGED', body: '서식 없는 본문', createdAt: '2026-11-19T23:59:59Z' },
    { number: 2, title: '기준일 당일', state: 'MERGED', body: '서식 없는 본문', createdAt: '2026-11-20T00:00:00Z' },
    { number: 3, title: '날짜 모름', state: 'OPEN', body: '서식 없는 본문' },
    { number: 4, title: '예전에 닫음', state: 'CLOSED', body: '서식 없는 본문', createdAt: '2026-01-01T00:00:00Z' },
    { number: 5, title: '예전이지만 갖춤', state: 'MERGED', body: 'Refs #9\n\n## 검증\n\n직접 실행해서 확인했다\n', createdAt: '2026-01-01T00:00:00Z' },
  ];
  const withSince = buildModel({ ...ia, since: '2026-11-20' }, issues, dated, '');
  assert.equal(withSince.since, '2026-11-20');
  assert.deepEqual(withSince.gaps.prsWithoutIssue.map((p) => p.number), [2, 3]);
  assert.deepEqual(withSince.gaps.prsWithoutEvidence.map((p) => p.number), [2, 3]);
  assert.equal(withSince.gaps.prsBeforeSince, 1);
  const without = buildModel(ia, issues, dated, '');
  assert.equal(without.since, '');
  assert.deepEqual(without.gaps.prsWithoutIssue.map((p) => p.number), [1, 2, 3]);
  assert.equal(without.gaps.prsBeforeSince, 0);
  // 기준일 전의 PR도 이슈와의 연결은 그대로 보인다.
  const issue9 = withSince.areas.flatMap((a) => a.flows.flatMap((f) => f.issues)).find((i) => i.number === 9);
  assert.deepEqual(issue9.prs.map((p) => p.number), [5]);
  assert.equal(model.gaps.prsBeforeSince, 0);
});
test('since 는 실제로 있는 YYYY-MM-DD 날짜만 받는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flow-atlas-'));
  const load = (since) => { const f = join(dir, 'flow-atlas.json'); writeFileSync(f, JSON.stringify({ ...ia, since })); return loadIa(f); };
  try {
    assert.equal(load('2026-11-20').since, '2026-11-20');
    assert.equal(load(undefined).since, undefined);
    for (const bad of ['2026-02-31', '2026-13-01', '2026-11-20T00:00:00Z', '20261120', 20261120, '']) assert.throws(() => load(bad), /since/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
