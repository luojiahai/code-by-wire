# Security Policy

## Supported versions

Only the latest released version of flightdeck receives security fixes.

## Reporting a vulnerability

Please report security issues privately. Use GitHub's private vulnerability
reporting on this repository (the Security tab, then "Report a vulnerability")
rather than opening a public issue. We aim to acknowledge reports within a few
days.

## What the app can access

flightdeck is a local desktop application. It:

- reads files under `~/.claude` (session transcripts and configuration) to
  display and reconstruct Claude Code sessions, and
- spawns local terminal (PTY) processes to run and control sessions.

It makes no outbound network connections. It does not send your transcripts,
prompts, or any local data anywhere. This is verifiable in `src/`.
