import { handleParseRequest, type ParseRequest } from "./protocol";

/**
 * The parse-worker utility process entry (its own bundle entry in electron.vite.config.ts, forked
 * by client.ts). Exists so summarize's O(transcript size) read+parse runs off the main thread: an
 * active session's transcript advances on every poll tick, and parsing a tens-of-MB file in main
 * blocked the event loop — pty echo and all IPC — for hundreds of ms every 3s. Message-loop only;
 * all logic lives in protocol.ts where tests can reach it.
 */
process.parentPort.on("message", (e) => {
  process.parentPort.postMessage(handleParseRequest(e.data as ParseRequest));
});
