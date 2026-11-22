#!/usr/bin/env node
// flow-atlas command line entry point.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, appendFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { currentLang, pickLang, say } from '../scripts/lib.mjs';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...rest] = process.argv.slice(2);
const SCRIPTS = { sync: 'sync-github.mjs', collect: 'collect.mjs', serve: 'serve.mjs', 'check-pr': 'check-pr.mjs', 'label-issue': 'label-issue.mjs' };
const INSTALL_DIR = '.github/flow-atlas';

if (command === 'init') init();
else if (SCRIPTS[command]) process.exit(spawnSync(process.execPath, [join(pkgRoot, 'scripts', SCRIPTS[command]), ...rest], { stdio: 'inherit' }).status ?? 1);
else {
  console.log(say(currentLang(), `flow-atlas <명령>

  init [폴더] [--lang ko|en] [--pages]   저장소에 설치하거나 최신으로 갱신한다
  sync [--check|--labels]                flow-atlas.json 에서 이슈 양식·PR 템플릿·라벨을 맞춘다
  collect [--sample] [--out 폴더]        대시보드 파일을 만든다 (서버 없이 열린다)
  serve [--port 번호] [--sample]         대시보드를 로컬 서버로 연다 (화면에서 동기화)`, `flow-atlas <command>

  init [dir] [--lang ko|en] [--pages]    install into a repository, or update an existing install
  sync [--check|--labels]                generate the issue form, PR template and labels from flow-atlas.json
  collect [--sample] [--out dir]         build the dashboard as a single HTML file
  serve [--port n] [--sample]            serve the dashboard locally with a sync icon`));
  process.exit(command && command !== 'help' && command !== '--help' ? 1 : 0);
}

/** 저장소에 PR이 하나라도 있는지 gh 로 묻는다. gh 가 없거나 로그인·원격이 없으면 없다고 본다. */
function hasPullRequests(cwd) {
  try {
    return JSON.parse(execFileSync('gh', ['pr', 'list', '--state', 'all', '--limit', '1', '--json', 'number'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).length > 0;
  } catch { return false; }
}

/** 새 프로젝트와 기존 프로젝트에 같은 명령을 쓴다. flow-atlas.json, 워크플로, 직접 쓴 PR 템플릿은 덮어쓰지 않는다. */
function init() {
  const flagValues = new Set(rest.flatMap((a, i) => (a === '--lang' ? [rest[i + 1]] : [])));
  const target = resolve(rest.find((a) => !a.startsWith('--') && !flagValues.has(a)) ?? '.');
  const lang = currentLang(target);
  const done = [];
  const kept = [];
  if (!existsSync(join(target, '.git'))) {
    console.error(say(lang, `${target} 은 git 저장소가 아니다. 먼저 git init 을 하거나 저장소 폴더를 지정한다.`, `${target} is not a git repository. Run git init first, or pass the repository folder.`));
    process.exit(1);
  }

  // 1. 도구 사본. 워크플로가 네트워크 없이 실행할 수 있게 저장소 안에 둔다. 다시 실행하면 최신으로 갱신된다.
  const dest = join(target, INSTALL_DIR);
  const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
  if (dest !== pkgRoot) {
    mkdirSync(dest, { recursive: true });
    for (const name of ['bin', 'scripts', 'dashboard', 'templates', 'docs', 'package.json', 'LICENSE', 'README.md', 'README.ko.md']) {
      cpSync(join(pkgRoot, name), join(dest, name), { recursive: true });
    }
    done.push(`${INSTALL_DIR}/ (flow-atlas ${version})`);
  }

  // 2. 영역·흐름 정본. 없을 때만 뼈대를 만든다.
  const config = join(target, 'flow-atlas.json');
  if (existsSync(config)) kept.push('flow-atlas.json');
  else {
    // 이미 PR이 있는 저장소라면 오늘(UTC)을 도입 기준일로 적는다. 그 전의 PR은 대시보드가 끊긴 연결로 세지 않는다.
    const since = hasPullRequests(target) ? new Date().toISOString().slice(0, 10) : undefined;
    writeFileSync(config, `${JSON.stringify({
      product: basename(target),
      version: 'v0.1',
      lang,
      since,
      areas: [{ id: 'core', name: say(lang, '핵심 기능', 'Core'), flows: [{ id: 'first', name: say(lang, '첫 사용자 흐름', 'First user flow'), scope: 'in' }] }],
    }, null, 2)}\n`);
    done.push(say(lang, 'flow-atlas.json (뼈대. 영역과 흐름을 고쳐 쓴다)', 'flow-atlas.json (starter; replace with your areas and flows)'));
    if (since) done.push(say(lang, `flow-atlas.json 의 since: ${since} (UTC 기준 오늘. 그 전에 만든 PR은 끊긴 연결로 세지 않는다)`, `since: ${since} in flow-atlas.json (today in UTC; PRs created before it are not counted as broken links)`));
  }

  // 3. 워크플로. 없을 때만 넣는다.
  const workflow = (template, name) => {
    const to = join(target, '.github/workflows', name);
    if (existsSync(to)) return kept.push(`.github/workflows/${name}`);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(pkgRoot, 'templates', template), to);
    done.push(`.github/workflows/${name}`);
  };
  workflow('tracking-workflow.yml', 'flow-atlas.yml');
  if (rest.includes('--pages')) workflow('pages-workflow.yml', 'flow-atlas-pages.yml');

  // 4. 이슈 양식과 PR 템플릿 생성.
  process.stdout.write(execFileSync(process.execPath, [join(pkgRoot, 'scripts/sync-github.mjs')], { cwd: target, encoding: 'utf8' }));

  // 5. 대시보드 산출물은 커밋하지 않는다.
  const ignore = join(target, '.gitignore');
  const current = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  if (!current.split(/\r?\n/).includes('dashboard-out/')) {
    appendFileSync(ignore, `${current && !current.endsWith('\n') ? '\n' : ''}dashboard-out/\n`);
    done.push(say(lang, '.gitignore 에 dashboard-out/ 추가', 'dashboard-out/ added to .gitignore'));
  }

  const run = `node ${INSTALL_DIR}/bin/cli.mjs`;
  const guide = `${INSTALL_DIR}/docs/decision-comment${lang === 'ko' ? '.ko' : ''}.md`;
  if (done.length) console.log(`\n${say(lang, '설치했다', 'Installed')}:\n- ${done.join('\n- ')}`);
  if (kept.length) console.log(`\n${say(lang, '이미 있어서 그대로 두었다', 'Already present, left untouched')}:\n- ${kept.join('\n- ')}`);
  console.log(say(lang, `
다음 순서:
1. flow-atlas.json 에 영역과 사용자 흐름을 적는다.
2. ${run} sync            이슈 양식을 다시 만든다
3. ${run} sync --labels   라벨을 만든다 (gh 로그인 필요)
4. 변경을 커밋하고 올린다.
5. ${run} collect         dashboard-out/index.html 을 만든다. 더블클릭으로 연다
   ${run} serve           또는 로컬 서버로 열어 화면에서 동기화한다
6. AGENTS.md 나 CLAUDE.md 에 ${guide} 의 지침 문구를 넣는다.`, `
Next steps:
1. Edit flow-atlas.json: your areas and user flows.
2. ${run} sync            regenerate the issue form
3. ${run} sync --labels   create labels (needs gh auth login)
4. Commit and push.
5. ${run} collect         writes dashboard-out/index.html; just open the file
   ${run} serve           or run a local server and sync from the page
6. Add the snippet from ${guide} to your AGENTS.md or CLAUDE.md.`));
}
