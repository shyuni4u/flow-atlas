#!/usr/bin/env node
// 이슈 양식의 "흐름" 선택을 읽어 area:/flow: 라벨을 맞춘다. issues 이벤트에서 gh CLI 로 실행한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadIa, listFlows, sectionAny, currentLang, say } from './lib.mjs';

/**
 * 이슈에 붙일 라벨과 뗄 라벨을 정한다. 네트워크를 쓰지 않는 순수 함수다.
 * 본문의 "흐름" 선택이 정본에 있으면 그것을 따른다. 없으면 이미 붙어 있는 flow: 라벨 중 정본에 있는 첫 번째를 따른다.
 * 양식 없이 만든 이슈에 손으로 붙인 라벨을 다음 수정 때 지우지 않기 위해서다. 둘 다 없으면 needs-flow 다.
 */
export function labelPlan(body, current, flows) {
  const chosen = sectionAny(body ?? '', 'flow');
  const key = chosen?.match(/\(([a-z0-9-]+\/[a-z0-9-]+)\)\s*$/)?.[1];
  const byLabel = current.filter((n) => n.startsWith('flow:')).map((n) => flows.find((f) => f.key === n.slice(5))).find(Boolean);
  const match = flows.find((f) => f.key === key) ?? byLabel ?? null;
  const want = match ? [`area:${match.area.id}`, `flow:${match.key}`] : ['needs-flow'];
  const managed = current.filter((n) => n.startsWith('area:') || n.startsWith('flow:') || n === 'needs-flow');
  return { match, want, add: want.filter((n) => !current.includes(n)), remove: managed.filter((n) => !want.includes(n)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const issue = event.issue;
  const lang = currentLang();
  if (!issue || issue.pull_request) { console.log(say(lang, '이슈 이벤트가 아니다. 건너뛴다.', 'Not an issue event. Skipping.')); process.exit(0); }

  const flows = listFlows(loadIa(join(process.cwd(), 'flow-atlas.json')));
  const { match, want, add, remove } = labelPlan(issue.body, (issue.labels ?? []).map((l) => l.name), flows);

  if (add.length === 0 && remove.length === 0) { console.log(say(lang, '라벨이 이미 맞다.', 'Labels are already correct.')); process.exit(0); }
  const cmd = ['issue', 'edit', String(issue.number)];
  if (add.length) cmd.push('--add-label', add.join(','));
  if (remove.length) cmd.push('--remove-label', remove.join(','));
  execFileSync('gh', cmd, { stdio: 'inherit' });
  console.log(match ? `#${issue.number} → ${want.join(', ')}` : say(lang, `#${issue.number}: 흐름을 찾지 못해 needs-flow 를 붙였다.`, `#${issue.number}: no flow found, added needs-flow.`));
}
