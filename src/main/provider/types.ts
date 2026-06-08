import type { Session, ProviderCapabilities } from '@shared/types'

export interface Provider {
  readonly id: string
  readonly capabilities: ProviderCapabilities
  listSessions(): Promise<Session[]>
}
