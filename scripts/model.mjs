// 영역·흐름 정본과 GitHub 이슈·PR 목록을 대시보드용 데이터로 합친다. 네트워크를 쓰지 않는 순수 함수다.
import { listFlows, sectionAny, stripComments, NO_ISSUE } from './lib.mjs';
import { parseDecision } from './decisions.mjs';

const LINK = /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\s*:?\s+#(\d+)/gi;
const prose = (body) => stripComments(body).replace(/^```[\s\S]*?^```\s*$/gm, '');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** PR 본문에서 `Closes #n`, `Refs #n` 을 읽는다. */
export function linksOf(body) {
  return [...prose(body).matchAll(LINK)].map((m) => ({
    number: Number(m[2]),
    relation: /^ref/i.test(m[1]) ? 'refs' : 'closes',
  }));
}

/** 본문 체크박스 진행. 내용이 없는 빈 체크박스는 세지 않는다. */
export function taskProgress(body) {
  const text = prose(body);
  const done = (text.match(/^\s*[-*]\s+\[[xX]\]\s+\S/gm) ?? []).length;
  const open = (text.match(/^\s*[-*]\s+\[ \]\s+\S/gm) ?? []).length;
  return { done, total: done + open };
}

export function hasVerification(body) {
  const v = sectionAny(prose(body), 'verification');
  return v !== null && v.replace(/`<[^`]*>`/g, '').replace(/<[^>\n]*>/g, '').replace(/\s/g, '').length >= 10;
}

function checksOf(rollup) {
  const items = rollup ?? [];
  if (items.length === 0) return 'none';
  const result = (c) => c.conclusion ?? c.state ?? '';
  if (items.some((c) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(result(c)))) return 'fail';
  if (items.some((c) => !result(c) || ['PENDING', 'EXPECTED'].includes(result(c)))) return 'pending';
  return 'pass';
}

function decisionsOf(item, where) {
  return (item.comments ?? []).flatMap((c) => {
    const d = parseDecision(c.body);
    return d ? [{ ...d, where, url: c.url ?? item.url }] : [];
  });
}

export function buildModel(ia, issues, prs, generatedAt, repo = null) {
  const since = ia.since ?? '';
  const prViews = prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state === 'MERGED' ? 'merged' : pr.state === 'CLOSED' ? 'closed' : pr.isDraft ? 'draft' : 'open',
    review: pr.reviewDecision || 'NONE',
    checks: checksOf(pr.statusCheckRollup),
    hasEvidence: hasVerification(pr.body),
    links: linksOf(pr.body),
    noIssueReason: prose(pr.body).match(NO_ISSUE)?.[1].trim() ?? '',
    decisions: decisionsOf(pr, `PR #${pr.number}`),
    // 도입 기준일(since, UTC 날짜)보다 먼저 만든 PR. 서식이 없던 때의 PR이라 끊긴 연결로 세지 않는다.
    beforeSince: Boolean(since && pr.createdAt && pr.createdAt.slice(0, 10) < since),
  }));

  const issueView = (issue) => {
    const linked = prViews.flatMap((pr) => pr.links.filter((l) => l.number === issue.number).slice(0, 1)
      .map((l) => ({ number: pr.number, title: pr.title, url: pr.url, state: pr.state, review: pr.review, checks: pr.checks, hasEvidence: pr.hasEvidence, relation: l.relation, decisions: pr.decisions })));
    const tasks = taskProgress(issue.body);
    const closed = issue.state === 'CLOSED';
    return {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      state: closed ? 'closed' : 'open',
      tasks,
      progress: closed ? 1 : tasks.total ? tasks.done / tasks.total : 0,
      prs: linked.map(({ decisions, ...pr }) => pr),
      decisions: [...decisionsOf(issue, `#${issue.number}`), ...linked.flatMap((pr) => pr.decisions)],
    };
  };

  const flowKeyOf = (issue) => (issue.labels ?? []).map((l) => l.name).find((n) => n.startsWith('flow:'))?.slice(5);
  const known = new Set(listFlows(ia).map((f) => f.key));

  const areas = ia.areas.map((area) => {
    const flows = area.flows.map((flow) => {
      const list = issues.filter((i) => flowKeyOf(i) === `${area.id}/${flow.id}`).map(issueView).sort((a, b) => a.number - b.number);
      // shipped: flow-atlas 를 들이기 전에 이미 만든 흐름. 닫힌 이슈 하나가 있는 것처럼 센다.
      // 이슈가 없으면 완료 100%이고, 열린 이슈가 생기면 진행 중으로 돌아간다. 범위 밖 흐름에는 쓰지 않는다.
      const shipped = flow.shipped === true && flow.scope === 'in';
      const status = flow.scope === 'out' ? 'out'
        : list.every((i) => i.state === 'closed') ? (list.length || shipped ? 'done' : 'todo')
        : shipped || list.some((i) => i.progress > 0 || i.prs.length > 0) ? 'doing' : 'todo';
      return { id: flow.id, name: flow.name, scope: flow.scope, shipped, status, progress: avg([...(shipped ? [1] : []), ...list.map((i) => i.progress)]), issues: list };
    });
    return { id: area.id, name: area.name, progress: avg(flows.filter((f) => f.scope === 'in').map((f) => f.progress)), flows };
  });

  const inScope = areas.flatMap((a) => a.flows.filter((f) => f.scope === 'in'));
  const allIssues = areas.flatMap((a) => a.flows.flatMap((f) => f.issues.map((i) => ({ ...i, flowName: f.name, scope: f.scope }))));
  const openIssues = allIssues.filter((i) => i.state === 'open' && i.scope === 'in');
  const livePrs = prViews.filter((pr) => pr.state !== 'closed' && !pr.beforeSince);

  const gaps = {
    issuesWithoutPr: openIssues.filter((i) => i.prs.length === 0).map(({ number, title, url }) => ({ number, title, url })),
    prsWithoutIssue: livePrs.filter((pr) => pr.links.length === 0).map(({ number, title, url, state, noIssueReason }) => ({ number, title, url, state, reason: noIssueReason })),
    prsWithoutEvidence: livePrs.filter((pr) => !pr.hasEvidence).map(({ number, title, url, state }) => ({ number, title, url, state })),
    issuesWithoutFlow: issues.filter((i) => i.state !== 'CLOSED' && !known.has(flowKeyOf(i))).map(({ number, title, url }) => ({ number, title, url })),
    // 기준일 때문에 위 두 PR 목록에서 빠진 PR 수. 화면이 "세지 않았다"고 밝히는 데 쓴다.
    prsBeforeSince: prViews.filter((pr) => pr.state !== 'closed' && pr.beforeSince && (pr.links.length === 0 || !pr.hasEvidence)).length,
  };

  const seen = new Set();
  const openDecisions = [...allIssues.flatMap((i) => i.decisions), ...prViews.flatMap((pr) => pr.decisions)]
    .filter((d) => d.status === 'waiting' && !seen.has(d.url + d.question) && seen.add(d.url + d.question))
    .sort((a, b) => Number(b.blocking) - Number(a.blocking));

  return {
    generatedAt,
    repo: repo ? { name: repo.nameWithOwner ?? '', description: repo.description ?? '', url: repo.url ?? '' } : null,
    lang: ia.lang === 'ko' || ia.lang === 'en' ? ia.lang : 'en',
    product: ia.product,
    version: ia.version ?? '',
    since,
    progress: avg(inScope.map((f) => f.progress)),
    counts: Object.fromEntries(['done', 'doing', 'todo', 'out'].map((s) => [s, areas.flatMap((a) => a.flows).filter((f) => f.status === s).length])),
    next: nextStep(openDecisions, openIssues, inScope),
    openDecisions,
    gaps,
    areas,
  };
}

/** "지금 할 한 가지" 제안. 막힌 질문 → 고칠 PR → 끝에 가장 가까운 이슈 → 시작 전 흐름 순으로 고른다. 문구는 화면이 kind 로 고른다. */
function nextStep(openDecisions, openIssues, inScope) {
  const blocking = openDecisions.find((d) => d.blocking);
  if (blocking) return { kind: 'answer', text: blocking.question, where: blocking.where, url: blocking.url };
  for (const issue of openIssues) {
    const pr = issue.prs.find((p) => p.state === 'open' && (p.checks === 'fail' || p.review === 'CHANGES_REQUESTED'));
    if (pr) return { kind: pr.checks === 'fail' ? 'fix-checks' : 'address-review', text: pr.title, where: `PR #${pr.number}`, url: pr.url };
  }
  const closest = openIssues.filter((i) => i.progress > 0 || i.prs.length > 0).sort((a, b) => b.progress - a.progress)[0];
  if (closest) return { kind: 'closest', text: closest.title, where: `#${closest.number}`, url: closest.url };
  const first = openIssues[0];
  if (first) return { kind: 'start', text: first.title, where: `#${first.number}`, url: first.url };
  const empty = inScope.find((f) => f.status === 'todo');
  if (empty) return { kind: 'create-issue', flow: empty.name, text: '', where: '', url: '' };
  return { kind: 'none', text: '', where: '', url: '' };
}
