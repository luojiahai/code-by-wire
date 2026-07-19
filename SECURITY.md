# Security Policy

## Supported versions

Only the latest released version of code-by-wire receives security fixes.

## Reporting a vulnerability

Please report security issues privately. Use GitHub's private vulnerability
reporting on this repository (the Security tab, then "Report a vulnerability")
rather than opening a public issue. We aim to acknowledge reports within a few
days.

## What the app can access

code-by-wire is a local desktop application. It:

- reads session transcripts and configuration under `~/.claude` and
  `~/.codex` (or `$CODEX_HOME`) to display and reconstruct Claude Code and
  Codex sessions,
- spawns local terminal (PTY) processes to run and control sessions,
- calls each account's own usage/rate-limit endpoint — Claude's
  `api.anthropic.com/api/oauth/usage` and Codex's
  `chatgpt.com/backend-api` — to show quota data, and
- checks GitHub Releases for app updates.

It does not send your transcripts, prompts, or any local data anywhere else.
This is verifiable in `src/`.
