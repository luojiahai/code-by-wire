---
title: "Getting Started"
description: "Install FlightDeck, launch it, and take a tour of the main views."
order: 1
---

## Install

FlightDeck needs [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
installed locally. That's what it reads sessions from.

Grab the build for your platform from the [Download page](/download/).
On macOS, open the `.dmg` and drag FlightDeck to Applications. The app is signed
and notarized, so it opens straight away. On Windows, run the `.exe`; it's unsigned
for now, so if SmartScreen warns, click **More info → Run anyway**.

## First launch

Open the app. Every session already running on your machine, including anything
Claude Code has touched, shows up immediately in the session rail on the left,
grouped by project. Nothing to configure.

## A tour of the main views

- **Session rail**: every session, grouped by project, searchable, each row
  flags its live state (working, waiting, idle, or ended).
- **Transcript**: every message, tool call, and result, reconstructed from disk
  and rendered cleanly.
- **Terminal**: an embedded terminal to drive a session, fork a live one, or
  adopt one you started elsewhere.
- **Telemetry**: context pressure, spend, token throughput, duty cycle, git,
  tasks, subagents, and background shells, live per session.
- **Stats**: a cross-session view with a year-long contributions calendar and
  exact, never-estimated totals.

Once installed, the app checks for new releases on launch and updates from
Settings → About.
