import type { AgentId } from "@shared/agents";
import type { Provider } from "./types";

/**
 * One Provider facade over the per-agent providers, so syncSessions and registerIpc keep their
 * single-provider signatures. Bulk enumeration unions every agent; per-candidate dispatch keys on
 * candidate.agent; per-id reads key on the injected resolver (managed registry → sessions table →
 * "claude" — built at the composition root). The prune keep-set inside syncSessions naturally
 * becomes the union of both providers' candidates.
 */
export function createCompositeProvider(
  providers: Record<AgentId, Provider>,
  agentOf: (id: string) => AgentId,
): Provider {
  const by = (id: string): Provider => providers[agentOf(id)];
  return {
    id: "composite",
    listCandidates: () =>
      Object.values(providers).flatMap((p) => p.listCandidates()),
    summarize: (c) => providers[c.agent].summarize(c),
    restate: (c, prev) => providers[c.agent].restate(c, prev),
    readTranscript: (id, since) => by(id).readTranscript(id, since),
    getToolResult: (id, toolUseId, agentId) =>
      by(id).getToolResult(id, toolUseId, agentId),
    readSubagentTranscript: (id, agentId, since) =>
      by(id).readSubagentTranscript(id, agentId, since),
    readTasks: (id, since) => by(id).readTasks(id, since),
    readShells: (id, since) => by(id).readShells(id, since),
    readShellOutput: (id, shellId, since) =>
      by(id).readShellOutput(id, shellId, since),
    readMonitors: (id, since) => by(id).readMonitors(id, since),
    readMonitorOutput: (id, monitorId, since) =>
      by(id).readMonitorOutput(id, monitorId, since),
    readMetrics: (id, since) => by(id).readMetrics(id, since),
    resolveResumeTarget: (id) => by(id).resolveResumeTarget(id),
    resolveSessionCwd: (id) => by(id).resolveSessionCwd(id),
    resolveTranscriptPath: (id) => by(id).resolveTranscriptPath(id),
  };
}
