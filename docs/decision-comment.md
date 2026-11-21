# Decision comments

A format for leaving a question that needs the owner's judgment as a single comment on an issue or pull request. The rule is [TRACK-05](rules.md). The dashboard lists comments whose status is `waiting` as open questions. [한국어](decision-comment.ko.md)

## Format

```markdown
### Decision needed: <one-line question>

- Status: waiting
- Blocking: yes

**Background**: <why the question came up; the file or behaviour you checked>

**Options**
1. <option> — <outcome and cost>
2. <option> — <outcome and cost>

**Recommended**: <number> — <reason>

**Decision**: 
```

## How to use it

- One question per comment. The first line must start with `### Decision needed:`.
- `Status` is `waiting`, `decided` or `withdrawn`. `Blocking` is `yes` when work cannot continue without the answer, `no` when work is proceeding on the recommended option.
- Questions about what to build or scope go on the issue; questions about how to build it go on the pull request. If there is no pull request yet, use the issue.
- When answered, **edit the same comment**: set `Status` to `decided` and write the choice and date under `Decision`. If the owner answered in a reply, copy the answer into the original comment.
- Record questions that were answered live in chat as well, with status `decided`, so the reason can be found later.
- Decisions that span several pieces of work, or that have a condition for revisiting, also go in your project's decision log.

The Korean keywords (`결정 요청`, `상태: 대기 / 결정됨 / 철회`, `막힘: 예 / 아니오`, `권장`, `결정`) are read the same way.

## Snippet for agent instructions

```text
When implementation needs the owner's judgment, leave the question as a comment on
the relevant issue or PR using .github/flow-atlas/docs/decision-comment.md.
Record it even if the answer came immediately in chat, with status decided.
For questions marked Blocking: no, proceed with the recommended option and revert
if the answer differs. When starting work, first check whether waiting comments on
the issue and its PRs have been answered.
```
