# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on **`luojiahai/code-by-wire-source`**
(github.com, private). Use the `gh` CLI for all operations.

> **Host pin (important):** the shell's `GH_HOST` defaults to a work enterprise host, but this
> repo's remote is personal `github.com`. Prefix every `gh` call with `GH_HOST=github.com` and
> target the repo explicitly with `-R luojiahai/code-by-wire-source`, or `gh` hits the wrong host.

## Conventions

- **Create an issue**: `GH_HOST=github.com gh issue create -R luojiahai/code-by-wire-source --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `GH_HOST=github.com gh issue view <number> -R luojiahai/code-by-wire-source --comments`.
- **List issues**: `GH_HOST=github.com gh issue list -R luojiahai/code-by-wire-source --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `GH_HOST=github.com gh issue comment <number> -R luojiahai/code-by-wire-source --body "..."`
- **Apply / remove labels**: `GH_HOST=github.com gh issue edit <number> -R luojiahai/code-by-wire-source --add-label "..."` / `--remove-label "..."`
- **Close**: `GH_HOST=github.com gh issue close <number> -R luojiahai/code-by-wire-source --comment "..."`

## When a skill says "publish to the issue tracker"

Create a GitHub issue with the command above.

## When a skill says "fetch the relevant ticket"

Run `GH_HOST=github.com gh issue view <number> -R luojiahai/code-by-wire-source --comments`.
