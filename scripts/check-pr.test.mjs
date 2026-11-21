// 실행: node --test scripts/check-pr.test.mjs
// 통과하는 본문과 일부러 깨뜨린 본문을 함께 검사한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPr } from './check-pr.mjs';
import { section } from './lib.mjs';

const good = `## 연결 이슈

Closes #12

## 변경 유형

- [x] 기능 추가
- [ ] 버그 수정

## 무엇이 달라지나

로그인 화면에 버튼이 생긴다.

## 검증

\`npm test\` 42건 통과. 에뮬레이터에서 버튼을 눌러 이동을 확인했다.
`;
const run = (body, extra = {}) => checkPr({ body, baseRef: 'main', defaultBranch: 'main', ...extra });

test('규칙을 지킨 본문은 통과한다', () => {
  assert.deepEqual(run(good), { errors: [], warnings: [] });
});
test('Refs 와 이슈 없음 사유도 연결로 인정한다', () => {
  assert.equal(run(good.replace('Closes #12', 'Refs #12')).errors.length, 0);
  assert.equal(run(good.replace('Closes #12', '이슈 없음: 의존성 정기 업데이트')).errors.length, 0);
});
test('연결 이슈가 없으면 실패한다', () => {
  assert.match(run(good.replace('Closes #12', '')).errors[0], /연결 이슈/);
});
test('채우지 않은 서식 문구와 주석 안의 키워드는 인정하지 않는다', () => {
  assert.equal(run(good.replace('Closes #12', '이슈 없음: <사유>')).errors.length, 1);
  assert.equal(run(good.replace('Closes #12', '<!-- Closes #12 -->')).errors.length, 1);
});
test('변경 유형을 체크하지 않으면 실패한다', () => {
  assert.match(run(good.replace('- [x]', '- [ ]')).errors[0], /변경 유형/);
});
test('검증이 비었거나 서식 그대로면 실패한다', () => {
  const empty = good.replace(/## 검증[\s\S]*$/, '## 검증\n\n`<실행한 명령과 결과>`\n');
  assert.match(run(empty).errors[0], /검증/);
});
test('기본 브랜치가 아닌 곳으로 가는 Closes 는 경고한다', () => {
  const result = run(good, { baseRef: 'develop' });
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings[0], /develop/);
});
test('section 은 다음 제목 앞까지만 읽는다', () => {
  assert.equal(section(good, '연결 이슈'), 'Closes #12');
  assert.equal(section(good, '없는 제목'), null);
});
test('영어 템플릿도 같은 규칙으로 검사한다', () => {
  const en = '## Linked issue\n\nNo issue: monthly dependency update\n\n## Change type\n\n- [x] Config / CI\n\n## Verification\n\nnpm test: 42 passing.\n';
  assert.deepEqual(run(en, { lang: 'en' }), { errors: [], warnings: [] });
  const errors = run(en.replace('No issue: monthly dependency update', 'Closes #').replace('- [x]', '- [ ]'), { lang: 'en' }).errors;
  assert.equal(errors.length, 2);
  assert.match(errors[0], /No linked issue/);
});
