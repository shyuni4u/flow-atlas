// 결정 요청 댓글(docs/decision-comment.md)을 읽는다. 한국어와 영어 서식을 모두 인정한다.
import { stripComments } from './lib.mjs';

const HEAD = /^#{2,4}\s*(?:결정 요청|Decision needed)\s*:\s*(.+)$/m;
const STATUS = { '대기': 'waiting', waiting: 'waiting', '결정됨': 'decided', decided: 'decided', '철회': 'withdrawn', withdrawn: 'withdrawn' };
const field = (text, labels) => text.match(new RegExp(`^\\s*(?:[-*]\\s+)?\\*{0,2}(?:${labels.join('|')})\\*{0,2}\\s*:\\s*(.*)$`, 'mi'))?.[1].trim() ?? '';

/** 결정 요청 댓글이면 내용을, 아니면 null 을 돌려준다. status 는 waiting | decided | withdrawn 이다. */
export function parseDecision(commentBody) {
  const text = stripComments(commentBody).trim();
  const head = text.match(HEAD);
  if (!head || text.indexOf(head[0]) !== 0) return null;
  return {
    question: head[1].trim(),
    status: STATUS[field(text, ['상태', 'Status']).toLowerCase()] ?? 'waiting',
    blocking: /^(예|yes)/i.test(field(text, ['막힘', 'Blocking'])),
    recommended: field(text, ['권장', 'Recommended']),
    decision: field(text, ['결정', 'Decision']),
  };
}
