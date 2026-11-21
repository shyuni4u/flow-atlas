#!/usr/bin/env node
// gh CLI 로 이슈와 PR을 읽어 대시보드 폴더를 만든다.
//   flow-atlas collect [--out dashboard-out]     현재 저장소를 읽는다 (gh 로그인 필요)
//   flow-atlas collect --sample [--out ...]      예시 데이터로 만든다 (네트워크 없음)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadIa, pickLang, say } from './lib.mjs';
import { buildModel } from './model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));

/** 이슈와 PR을 읽어 대시보드 폴더에 index.html 과 data.json 을 쓰고 데이터를 돌려준다. */
export function collect({ sample = false, out = 'dashboard-out' } = {}) {
  let ia, issues, prs, repo = null;
  if (sample) {
    ({ ia, issues, prs, repo } = JSON.parse(readFileSync(join(here, `../dashboard/sample-input.${pickLang()}.json`), 'utf8')));
  } else {
    ia = loadIa(join(process.cwd(), 'flow-atlas.json'));
    issues = gh(['issue', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,title,state,body,url,labels,comments']);
    // 저장소 이름과 설명은 없어도 화면이 뜨므로, 읽지 못하면 비워 둔다.
    try { repo = gh(['repo', 'view', '--json', 'nameWithOwner,description,url']); } catch { repo = null; }
    prs = gh(['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,title,state,isDraft,body,url,reviewDecision,statusCheckRollup,comments']);
  }
  const model = buildModel(ia, issues, prs, new Date().toISOString(), repo);
  if (sample) model.sample = true;
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  // 데이터를 화면 파일 안에 넣는다. 서버 없이 index.html 을 더블클릭해도 열린다.
  const page = readFileSync(join(here, '../dashboard/index.html'), 'utf8');
  const slot = '<script id="embedded" type="application/json">null</script>';
  if (!page.includes(slot)) throw new Error('dashboard/index.html has no data slot');
  const embedded = JSON.stringify(model).replace(/</g, '\\u003c');
  writeFileSync(join(dir, 'index.html'), page.replace(slot, () => `<script id="embedded" type="application/json">${embedded}</script>`));
  writeFileSync(join(dir, 'data.json'), JSON.stringify(model, null, 1));
  return { model, dir, issues: issues.length, prs: prs.length };
}

/** GitHub API 남은 양. gh 의 이슈·PR 목록은 GraphQL 한도를 쓴다. 이 조회 자체는 한도를 쓰지 않는다. */
export function rateLimit() {
  const r = gh(['api', 'rate_limit']).resources.graphql;
  return { remaining: r.remaining, limit: r.limit, resetAt: new Date(r.reset * 1000).toISOString() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let r;
  try {
    r = collect({ sample: argv.includes('--sample'), out: argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : undefined });
  } catch (e) {
    // gh 가 없거나 로그인하지 않았을 때 긴 오류 대신 할 일을 알려준다.
    const detail = String(e.stderr || e.message || e).trim().split('\n').filter(Boolean).slice(-1)[0];
    const lang = pickLang();
    console.error(e.code === 'ENOENT'
      ? say(lang, 'gh 를 찾지 못했다. GitHub CLI 를 설치하고 gh auth login 을 실행한다: https://cli.github.com/', 'gh was not found. Install the GitHub CLI and run gh auth login: https://cli.github.com/')
      : say(lang, `읽지 못했다: ${detail}\ngh auth status 로 로그인 상태를 확인한다.`, `Could not read the repository: ${detail}\nCheck your login with gh auth status.`));
    process.exit(1);
  }
  const lang = r.model.lang;
  const total = Math.round(r.model.progress * 100);
  console.log(say(lang, `브라우저로 열기: ${join(r.dir, 'index.html')}`, `Open in a browser: ${join(r.dir, 'index.html')}`));
  console.log(say(lang, `OK: 이슈 ${r.issues}건, PR ${r.prs}건, 전체 진행 ${total}%`, `OK: ${r.issues} issues, ${r.prs} PRs, ${total}% overall`));
}
