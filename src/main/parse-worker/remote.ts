import type { ParseWorkerClient } from "./client";
import type { RemoteClaudeReads } from "../provider/claude";

/**
 * The claude provider's RemoteClaudeReads over the parse-worker client: one method per op, with
 * claudeDir baked in (it's main's resolved config, so it rides every request rather than living as
 * worker state). Pure adaptation — the fault contract (any rejection → the provider reads
 * in-process) is the client's.
 */
export function createRemoteClaudeReads(
  client: ParseWorkerClient,
  claudeDir: string,
): RemoteClaudeReads {
  return {
    summarize: (candidate) => client.call({ op: "summarize", candidate }),
    listCandidates: (now, recentWindowMs) =>
      client.call({ op: "listCandidates", claudeDir, now, recentWindowMs }),
    readTranscript: (id, since) =>
      client.call({ op: "readTranscript", claudeDir, id, since }),
    readSubagentTranscript: (id, agentId, since) =>
      client.call({
        op: "readSubagentTranscript",
        claudeDir,
        id,
        agentId,
        since,
      }),
    getToolResult: (id, toolUseId, agentId) =>
      client.call({ op: "getToolResult", claudeDir, id, toolUseId, agentId }),
    readTasks: (id, since) =>
      client.call({ op: "readTasks", claudeDir, id, since }),
    readShells: (id, since) =>
      client.call({ op: "readShells", claudeDir, id, since }),
    readShellOutput: (id, shellId, since) =>
      client.call({ op: "readShellOutput", claudeDir, id, shellId, since }),
    readMonitors: (id, since) =>
      client.call({ op: "readMonitors", claudeDir, id, since }),
    readMonitorOutput: (id, monitorId, since) =>
      client.call({ op: "readMonitorOutput", claudeDir, id, monitorId, since }),
    readMetrics: (id, since) =>
      client.call({ op: "readMetrics", claudeDir, id, since }),
  };
}
