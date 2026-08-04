import { createParseRequestHandler, type ParseRequest } from "./protocol";

/**
 * The parse-worker utility process entry (its own bundle entry in electron.vite.config.ts, forked
 * by client.ts). Exists so every O(transcript-size) and O(session-count) poll-driven read runs off
 * the main thread: an active session's transcript advances on every poll tick, and reading or
 * parsing a tens-of-MB file in main blocked the event loop — pty echo and all IPC — for hundreds
 * of ms every poll (#430, #432). Message-loop only; all logic lives in protocol.ts (and the reader
 * it hosts) where tests can reach it.
 */
const handle = createParseRequestHandler();
process.parentPort.on("message", (e) => {
  process.parentPort.postMessage(handle(e.data as ParseRequest));
});
