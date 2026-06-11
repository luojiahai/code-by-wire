# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on
**`luojiahai/code-by-wire`**. Use the `gh` CLI for all operations, targeting the
repo explicitly with `-R luojiahai/code-by-wire`.

## Conventions

- **Create an issue**: `gh issue create -R luojiahai/code-by-wire --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> -R luojiahai/code-by-wire --comments`.
- **List issues**: `gh issue list -R luojiahai/code-by-wire --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> -R luojiahai/code-by-wire --body "..."`
- **Apply / remove labels**: `gh issue edit <number> -R luojiahai/code-by-wire --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> -R luojiahai/code-by-wire --comment "..."`

## When a skill says "publish to the issue tracker"

Create a GitHub issue with the command above.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> -R luojiahai/code-by-wire --comments`.
