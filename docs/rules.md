# flow-atlas rules

When they apply: creating issues and pull requests, or changing areas, user flows or scope. [한국어](rules.ko.md)

## TRACK-01 · One file is the source of truth for areas and user flows.

- Do: split the product into areas → user flows in `flow-atlas.json`. The issue form options and labels are generated from it; do not edit them by hand. A flow cut from this version stays in the file with `scope` set to `out`.
- Evidence: the generated-files check passes; cut flows are listed with a condition for revisiting them.

## TRACK-02 · An issue says what and why.

- Do: one issue belongs to one flow. Describe the outcome for the user without implementation terms, and list the work as checkboxes. How it is built goes in the pull request, not the issue.
- Evidence: the issue carries a flow label; checkbox progress is visible.

## TRACK-03 · A pull request says how it changed and how it was verified.

- Do: write the linked issue, change type, what changes, and verification. Do not leave unverified parts blank: say so and why.
- Evidence: the PR body check passes. The check only sees that sections are filled in; it does not judge whether the verification is true.

## TRACK-04 · Mark the relation between issue and pull request with a keyword.

- Do: `Closes #n` when this PR finishes the issue, `Refs #n` for partial work. For unplanned work write `No issue: <reason>` so it is visible.
- Evidence: issues without a PR and PRs without an issue can be listed.
- Note: GitHub only records `Closes` as a link for PRs into the default branch. `Refs` is not a GitHub keyword and only leaves a mention on the issue timeline.

## TRACK-05 · Questions for the owner go in a comment on the issue or pull request.

- Do: leave questions that need judgment in the [decision comment](decision-comment.md) format. Scope questions go on the issue, implementation questions on the PR. Record questions answered live in chat as decided. When answered, edit the same comment with the status and decision.
- Evidence: waiting and decided questions can be listed per issue and PR.

## See also

- [README](../README.md): installation and the dashboard
- [Decision comments](decision-comment.md): the format for TRACK-05
