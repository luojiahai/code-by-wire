// PROTOTYPE — throwaway. Mirrors the normalized model from ADR-0003 closely
// enough to feel real, but only as much as the mock UI needs.

export type SessionState = 'working' | 'waiting' | 'idle' | 'ended'
export type Management = 'managed' | 'observed'
export type ModelId = 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-haiku-4-5'

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface Task {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  blockedBy?: string[]
}

export interface Subagent {
  id: string
  type: string
  status: 'working' | 'done' | 'failed'
  model: ModelId
  tokens: number
  durationMs: number
  children?: Subagent[]
}

export interface ContextBreakdown {
  system: number // CLAUDE.md + system prompt
  tools: number // MCP + tool defs
  messages: number
  files: number
}

export interface Session {
  id: string
  title: string
  project: string
  branch?: string
  state: SessionState
  management: Management
  model: ModelId
  contextPct: number
  contextWindow: number
  contextBreakdown: ContextBreakdown
  usage: Usage
  equivApiValueUsd: number
  lastActivityMs: number
  currentTask?: string
  waitingReason?: string
  tasks: Task[]
  subagents: Subagent[]
}

export interface RateLimit {
  usedPct: number
  resetsAt: number
}

export interface Account {
  billingMode: 'subscription' | 'api'
  plan: string
  fiveHour: RateLimit
  sevenDay: RateLimit
}

export interface Stats {
  weeklyMessages: { day: string; count: number }[]
  modelMix: { model: ModelId; tokens: number }[]
  projectRollup: { project: string; sessions: number; equivUsd: number }[]
  weekEquivUsd: number
  weekTokens: number
}
