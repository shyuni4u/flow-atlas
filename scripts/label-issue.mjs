#!/usr/bin/env node
// 이슈 양식의 "흐름" 선택을 읽어 area:/flow: 라벨을 맞춘다. issues 이벤트에서 gh CLI 로 실행한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadIa, listFlows, sectionAny, currentLang, say } from './lib.mjs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;
const lang = currentLang();
if (!issue || issue.pull_request) { console.log(say(lang, '이슈 이벤트가 아니다. 건너뛴다.', 'Not an issue event. Skipping.')); process.exit(0); }

const flows = listFlows(loadIa(join(process.cwd(), 'flow-atlas.json')));
const chosen = sectionAny(issue.body ?? '', 'flow');
const key = chosen?.match(/\(([a-z0-9-]+\/[a-z0-9-]+)\)\s*$/)?.[1];
const match = flows.find((f) => f.key === key);

const want = match ? [`area:${match.area.id}`, `flow:${match.key}`] : ['needs-flow'];
const current = (issue.labels ?? []).map((l) => l.name);
const managed = current.filter((n) => n.startsWith('area:') || n.startsWith('flow:') || n === 'needs-flow');
const add = want.filter((n) => !current.includes(n));
const remove = managed.filter((n) => !want.includes(n));

if (add.length === 0 && remove.length === 0) { console.log(say(lang, '라벨이 이미 맞다.', 'Labels are already correct.')); process.exit(0); }
const cmd = ['issue', 'edit', String(issue.number)];
if (add.length) cmd.push('--add-label', add.join(','));
if (remove.length) cmd.push('--remove-label', remove.join(','));
execFileSync('gh', cmd, { stdio: 'inherit' });
console.log(match ? `#${issue.number} → ${want.join(', ')}` : say(lang, `#${issue.number}: 흐름을 찾지 못해 needs-flow 를 붙였다.`, `#${issue.number}: no flow found, added needs-flow.`));
