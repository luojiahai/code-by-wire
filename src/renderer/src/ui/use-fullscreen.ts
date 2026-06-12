import { useLayoutEffect, useState } from 'react'

/**
 * Track whether the window is in native macOS fullscreen, so the header can slide the wordmark into the
 * corner the traffic lights vacate. The main process owns the truth and pushes it; we mirror it into
 * state. Defaults to false, which is always right on first load (windows never open in fullscreen), and
 * a dev reload while fullscreen is re-synced by main's did-finish-load push. `useLayoutEffect` attaches
 * the listener on commit, before that push lands, so no update is lost. Off macOS main never sends, so
 * this stays false and the header never insets.
 */
export function useFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false)
  useLayoutEffect(() => window.api.onFullscreenChange(setIsFullscreen), [])
  return isFullscreen
}
