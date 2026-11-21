#!/usr/bin/env node
// PR 본문이 추적 규칙(TRACK-03, TRACK-04)을 지키는지 검사한다. 한국어와 영어 항목 제목을 모두 인정한다.
// GitHub Actions 에서는 GITHUB_EVENT_PATH 의 이벤트 파일을 읽는다. 본문을 셸에 넣지 않는다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sectionAny, stripComments, currentLang, say, NO_ISSUE } from './lib.mjs';

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#\d+/i;
const REFERENCE = /\brefs?\s*:?\s+#\d+/i;
const isPlaceholder = (text) => /^[`<]/.test(text.trim());

export function checkPr({ body, baseRef, defaultBranch, lang = 'ko' }) {
  const errors = [];
  const warnings = [];
  const text = stripComments(body).replace(/^```[\s\S]*?^```\s*$/gm, '');

  const closes = CLOSING.test(text);
  const refs = REFERENCE.test(text);
  const noIssue = text.match(NO_ISSUE);
  const hasReason = noIssue && noIssue[1].trim().length >= 5 && !isPlaceholder(noIssue[1]);
  if (!closes && !refs && !hasReason) {
    errors.push(say(lang,
      '연결 이슈가 없다. `Closes #번호`(이 PR로 이슈가 끝남) 또는 `Refs #번호`(일부만 진행)를 적는다. 계획에 없던 작업이면 `이슈 없음: 사유`를 적는다.',
      'No linked issue. Write `Closes #n` (this PR finishes the issue) or `Refs #n` (partial work). For unplanned work write `No issue: <reason>`.'));
  }
  if (closes && baseRef && defaultBranch && baseRef !== defaultBranch) {
    warnings.push(say(lang,
      `대상 브랜치가 ${baseRef} 이다. GitHub는 기본 브랜치(${defaultBranch})로 가는 PR의 Closes 만 연결로 기록하므로 병합해도 이슈가 닫히지 않는다.`,
      `This PR targets ${baseRef}. GitHub only records Closes for PRs into the default branch (${defaultBranch}), so merging will not close the issue.`));
  }

  const type = sectionAny(text, 'changeType');
  if (type === null) errors.push(say(lang, '`## 변경 유형` 항목이 없다.', 'The `## Change type` section is missing.'));
  else if (!/^\s*[-*]\s+\[[xX]\]\s+\S/m.test(type)) errors.push(say(lang, '`## 변경 유형`에서 하나 이상을 체크한다.', 'Check at least one box under `## Change type`.'));

  const verification = sectionAny(text, 'verification');
  if (verification === null) errors.push(say(lang, '`## 검증` 항목이 없다.', 'The `## Verification` section is missing.'));
  else {
    const filled = verification.replace(/`<[^`]*>`/g, '').replace(/<[^>\n]*>/g, '').replace(/\s/g, '');
    if (filled.length < 10) {
      errors.push(say(lang,
        '`## 검증`이 비어 있다. 실행한 명령과 결과, 또는 직접 확인한 화면을 적는다. 검증하지 못했다면 그 사실과 이유를 적는다.',
        '`## Verification` is empty. Write the commands you ran and their results, or what you checked by hand. If you could not verify, say so and why.'));
    }
  }
  return { errors, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lang = currentLang();
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  if (!pr) { console.log(say(lang, 'pull_request 이벤트가 아니다. 건너뛴다.', 'Not a pull_request event. Skipping.')); process.exit(0); }
  if (pr.user?.type === 'Bot') { console.log(say(lang, '봇이 만든 PR 이다. 건너뛴다.', 'PR opened by a bot. Skipping.')); process.exit(0); }
  const { errors, warnings } = checkPr({ body: pr.body ?? '', baseRef: pr.base?.ref, defaultBranch: event.repository?.default_branch, lang });
  for (const w of warnings) console.log(`::warning::${w}`);
  for (const e of errors) console.log(`::error::${e}`);
  if (errors.length) process.exit(1);
  console.log(say(lang, 'OK: PR 본문이 추적 규칙을 지킨다.', 'OK: the PR body follows the tracking rules.'));
}
