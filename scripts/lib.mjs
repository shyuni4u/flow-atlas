// 추적 하네스 공통 함수. 의존성 없이 Node 표준 모듈만 쓴다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ID = /^[a-z0-9][a-z0-9-]{0,19}$/;
// 2026-02-31 처럼 없는 날짜는 Date 가 다음 달로 넘기므로, 되돌려 적은 값과 같은지 본다.
const isDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** flow-atlas.json 을 읽고 형식을 검사한다. 오류가 있으면 전부 모아 던진다. */
export function loadIa(file) {
  const ia = JSON.parse(readFileSync(file, 'utf8'));
  const lang = pickLang(ia);
  const errors = [];
  const bad = (ko, en) => errors.push(say(lang, ko, en));
  if (!ia.product) bad('product 가 비어 있다', 'product is empty');
  if (ia.lang !== undefined && !['ko', 'en'].includes(ia.lang)) bad('lang 은 ko 또는 en 이어야 한다', 'lang must be ko or en');
  if (ia.since !== undefined && !isDate(ia.since)) bad('since 는 YYYY-MM-DD 날짜여야 한다', 'since must be a YYYY-MM-DD date');
  if (!Array.isArray(ia.areas) || ia.areas.length === 0) bad('areas 가 비어 있다', 'areas is empty');
  const areaIds = new Set();
  for (const area of ia.areas ?? []) {
    if (!ID.test(area.id ?? '')) bad(`영역 id 는 영문 소문자·숫자·하이픈 20자 이내여야 한다: ${area.id}`, `area id must be lowercase letters, digits or hyphens, 20 characters at most: ${area.id}`);
    if (!area.name || /[()]/.test(area.name)) bad(`영역 name 이 비었거나 괄호를 포함한다: ${area.id}`, `area name is empty or contains parentheses: ${area.id}`);
    if (areaIds.has(area.id)) bad(`영역 id 중복: ${area.id}`, `duplicate area id: ${area.id}`);
    areaIds.add(area.id);
    if (!Array.isArray(area.flows) || area.flows.length === 0) bad(`흐름이 없는 영역: ${area.id}`, `area has no flows: ${area.id}`);
    const flowIds = new Set();
    for (const flow of area.flows ?? []) {
      const key = `${area.id}/${flow.id}`;
      if (!ID.test(flow.id ?? '')) bad(`흐름 id 형식 오류: ${key}`, `invalid flow id: ${key}`);
      if (!flow.name || /[()]/.test(flow.name)) bad(`흐름 name 이 비었거나 괄호를 포함한다: ${key}`, `flow name is empty or contains parentheses: ${key}`);
      if (!['in', 'out'].includes(flow.scope)) bad(`흐름 scope 는 in 또는 out 이어야 한다: ${key}`, `flow scope must be in or out: ${key}`);
      if (flowIds.has(flow.id)) bad(`흐름 id 중복: ${key}`, `duplicate flow id: ${key}`);
      flowIds.add(flow.id);
    }
  }
  if (errors.length) throw new Error(`${file}\n- ${errors.join('\n- ')}`);
  return ia;
}

/** 영역·흐름을 한 줄씩 펼친다. option 은 이슈 양식의 선택지, key 는 라벨과 대시보드의 식별자다. */
export function listFlows(ia) {
  return ia.areas.flatMap((area) => area.flows.map((flow) => ({
    area,
    flow,
    key: `${area.id}/${flow.id}`,
    option: `${area.name} › ${flow.name} (${area.id}/${flow.id})`,
  })));
}

/** 주석을 지운 본문에서 `## 제목` 또는 `### 제목` 아래 내용을 꺼낸다. 없으면 null. */
export function section(body, title) {
  const lines = stripComments(body).split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{2,3}\s+/.test(l) && l.replace(/^#+\s+/, '').trim() === title);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,3}\s+/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

export function stripComments(text) {
  return String(text ?? '').replace(/<!--[\s\S]*?-->/g, '');
}

// ---- 언어 ----------------------------------------------------------------
// 생성하는 서식과 출력 문구의 언어. --lang 인자 > flow-atlas.json 의 lang > FLOW_ATLAS_LANG > 시스템 언어 순으로 정하고, 모르면 영어다.
export function pickLang(config = null) {
  const i = process.argv.indexOf('--lang');
  const system = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').slice(0, 2);
  return [i > 0 ? process.argv[i + 1] : null, config?.lang, process.env.FLOW_ATLAS_LANG, system].find((c) => c === 'ko' || c === 'en') ?? 'en';
}

/** 현재 폴더의 flow-atlas.json 을 보고 언어를 정한다. 파일이 없거나 깨져 있어도 동작한다. */
export function currentLang(root = process.cwd()) {
  try { return pickLang(JSON.parse(readFileSync(join(root, 'flow-atlas.json'), 'utf8'))); } catch { return pickLang(); }
}

export const say = (lang, ko, en) => (lang === 'ko' ? ko : en);

// 이슈 양식과 PR 템플릿의 항목 제목. 읽을 때는 두 언어를 모두 인정한다.
export const TERMS = {
  ko: { flow: '흐름', outcome: '사용자가 얻는 결과', tasks: '작업 항목', outOfScope: '범위 밖', linkedIssue: '연결 이슈', changeType: '변경 유형', change: '무엇이 달라지나', verification: '검증', noIssue: '이슈 없음' },
  en: { flow: 'Flow', outcome: 'Outcome for the user', tasks: 'Tasks', outOfScope: 'Out of scope', linkedIssue: 'Linked issue', changeType: 'Change type', change: 'What changes', verification: 'Verification', noIssue: 'No issue' },
};
export const sectionAny = (body, key) => section(body, TERMS.ko[key]) ?? section(body, TERMS.en[key]);
export const NO_ISSUE = /^\s*(?:이슈 없음|No issue)\s*:\s*(.+)$/mi;
