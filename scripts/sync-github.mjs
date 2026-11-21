#!/usr/bin/env node
// flow-atlas.json 에서 이슈 양식과 PR 템플릿을 만들고, 요청하면 라벨을 맞춘다.
//   flow-atlas sync            생성 파일을 쓴다
//   flow-atlas sync --check    생성 파일이 최신인지만 검사한다(CI용)
//   flow-atlas sync --labels   gh CLI 로 저장소 라벨을 만들거나 갱신한다
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadIa, listFlows, pickLang, say, TERMS } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const args = new Set(process.argv.slice(2));
let ia;
try { ia = loadIa(join(root, 'flow-atlas.json')); } catch (e) { console.error(e.message); process.exit(1); }
const lang = pickLang(ia);
const t = TERMS[lang];
const flows = listFlows(ia);
const q = (s) => JSON.stringify(s);

const issueForm = `# ${say(lang, '생성 파일이다. flow-atlas.json 을 고친 뒤 flow-atlas sync 로 다시 만든다.', 'Generated file. Edit flow-atlas.json and run flow-atlas sync to regenerate.')}
name: ${q(say(lang, '작업', 'Work item'))}
description: ${q(say(lang, '사용자 흐름 하나에 속하는 작업을 계획한다. 무엇을 왜 하는지 적고, 구현 방법은 PR에 적는다.', 'Plan a piece of work that belongs to one user flow. Say what and why here; how goes in the pull request.'))}
body:
  - type: dropdown
    id: flow
    attributes:
      label: ${q(t.flow)}
      description: ${q(say(lang, '이 작업이 속한 영역과 사용자 흐름. 목록에 없으면 flow-atlas.json 에 먼저 추가한다.', 'The area and user flow this work belongs to. If it is not listed, add it to flow-atlas.json first.'))}
      options:
${flows.map((f) => `        - ${q(f.option)}`).join('\n')}
    validations:
      required: true
  - type: textarea
    id: outcome
    attributes:
      label: ${q(t.outcome)}
      description: ${q(say(lang, '누가 어디서 시작해 무엇을 할 수 있게 되는가. 기술 용어 없이 적는다.', 'Who starts where, and what can they do afterwards. No implementation terms.'))}
    validations:
      required: true
  - type: textarea
    id: tasks
    attributes:
      label: ${q(t.tasks)}
      description: ${q(say(lang, '체크박스로 적는다. 대시보드가 진행률을 여기서 읽는다.', 'Write them as checkboxes. The dashboard reads progress from here.'))}
      value: |
        - [ ] 
        - [ ] 
    validations:
      required: true
  - type: textarea
    id: out-of-scope
    attributes:
      label: ${q(t.outOfScope)}
      description: ${q(say(lang, '이번에 하지 않기로 한 것과 다시 볼 조건.', 'What you decided not to do this time, and when to revisit it.'))}
`;

// 직접 쓴 PR 템플릿은 덮어쓰지 않는다. 없거나 관리 표시(tracking-template)가 있을 때만 맞춘다.
const prPath = '.github/pull_request_template.md';
const prManaged = !existsSync(join(root, prPath)) || readFileSync(join(root, prPath), 'utf8').includes('tracking-template');
const outputs = [
  ['.github/ISSUE_TEMPLATE/work.yml', issueForm],
  ...(prManaged ? [[prPath, readFileSync(resolve(here, `../templates/pull_request_template.${lang}.md`), 'utf8')]] : []),
];
if (!prManaged) {
  console.log(say(lang,
    `${prPath} 는 직접 쓴 파일이라 그대로 둔다. PR 본문 검사는 "## ${t.linkedIssue}", "## ${t.changeType}", "## ${t.verification}" 항목을 요구하므로 세 항목을 넣어 둔다.`,
    `${prPath} was written by hand, so it is left alone. The PR check requires "## ${t.linkedIssue}", "## ${t.changeType}" and "## ${t.verification}" sections; add them to your template.`));
}

if (args.has('--check')) {
  const stale = outputs.filter(([path, content]) => !existsSync(join(root, path)) || readFileSync(join(root, path), 'utf8') !== content);
  if (stale.length) {
    const names = stale.map(([p]) => p).join(', ');
    console.error(say(lang, `생성 파일이 최신이 아니다: ${names}\nflow-atlas sync 를 실행하고 커밋한다.`, `Generated files are stale: ${names}\nRun flow-atlas sync and commit the result.`));
    process.exit(1);
  }
  console.log(say(lang, `OK: 영역 ${ia.areas.length}개, 흐름 ${flows.length}개, 생성 파일 ${outputs.length}개가 최신이다.`, `OK: ${ia.areas.length} areas, ${flows.length} flows, ${outputs.length} generated files up to date.`));
} else if (args.has('--labels')) {
  const labels = [
    ...ia.areas.map((a) => [`area:${a.id}`, '1B55B0', say(lang, `영역: ${a.name}`, `Area: ${a.name}`)]),
    ...flows.map((f) => [`flow:${f.key}`, 'C5D9F5', say(lang, `흐름: ${f.area.name} › ${f.flow.name}`, `Flow: ${f.area.name} › ${f.flow.name}`)]),
    ['needs-flow', 'D93F0B', say(lang, '흐름이 지정되지 않은 이슈', 'Issue without a flow')],
  ];
  for (const [name, color, description] of labels) {
    execFileSync('gh', ['label', 'create', name, '--color', color, '--description', description.slice(0, 100), '--force'], { stdio: 'inherit' });
  }
  console.log(say(lang, `OK: 라벨 ${labels.length}개를 맞췄다. 목록에서 빠진 예전 라벨은 지우지 않는다.`, `OK: ${labels.length} labels synced. Labels removed from flow-atlas.json are not deleted.`));
} else {
  for (const [path, content] of outputs) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
    console.log(`wrote ${path}`);
  }
}
