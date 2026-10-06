# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **Sub-issue**: `gh issue create --parent <parent>`, or `gh issue edit <n> --parent <parent>` for an existing issue.
- **Blocking edge**: GitHub's native issue dependencies. `gh issue create --blocked-by <n>,<n>`, or `gh issue edit <n> --add-blocked-by <blocker>` (`--remove-blocked-by` to drop one). Publish blockers first so they have numbers. A ticket is unblocked when every blocker is closed.

The repo is `phillip-hirsch/japan-trip-december-2026`. `gh` infers it inside a clone with a GitHub remote; in a checkout without one (`no git remotes found`), pass `--repo phillip-hirsch/japan-trip-december-2026`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list` can't return author association, so use `gh api 'repos/phillip-hirsch/japan-trip-december-2026/pulls?state=open' --paginate --jq '.[] | {number, title, body, labels: [.labels[].name], author: .user.login, author_association}'`, read comments per PR with `gh pr view <number> --comments`, and drop any with `author_association` of `OWNER`, `MEMBER` or `COLLABORATOR`; every other value (`CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, `FIRST_TIMER`, `NONE`, …) is external.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Labels**: `gh issue create --label` fails on a missing label, so before the first write create only the missing ones (so existing labels keep their colours): `for l in map research prototype grilling task; do gh label list --search "wayfinder:$l" --json name --jq '.[].name' | grep -qx "wayfinder:$l" || gh label create "wayfinder:$l"; done`.
- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: a sub-issue of the map (see **Sub-issue** under Conventions). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see **Blocking edge** under Conventions. Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body.
- **Frontier query**: list the map's children in map order with `gh issue view <map> --json subIssues --jq '.subIssues.nodes[] | select(.state == "OPEN") | .number'` (or the task list in the map body), then for each run `gh issue view <n> --json assignees,blockedBy,body` and drop any with an assignee or an open blocker (a `blockedBy` node with `state == "OPEN"`, or a `Blocked by` line in `body` naming an issue that `gh issue view <blocker> --json state` reports open); the first remaining child wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
