import {
  ArrowLeft,
  FolderOpen,
  GitBranch,
  GitPullRequestArrow,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  SquareDashedMousePointer,
  SquareTerminal,
  Terminal,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

/**
 * The app's curated icon set, keyed by the design's glyph names (see the readme's ICONOGRAPHY map).
 * One indirection so call sites stay `<Icon name="plus" />` and the lucide imports live in one file.
 * Names follow lucide-react's current exports; if one fails to resolve, check the lucide changelog
 * (e.g. AlertTriangle was renamed TriangleAlert).
 */
const ICONS = {
  'arrow-left': ArrowLeft,
  'folder-open': FolderOpen,
  'git-branch': GitBranch,
  'git-pull-request-arrow': GitPullRequestArrow,
  'messages-square': MessagesSquare,
  plus: Plus,
  'refresh-cw': RefreshCw,
  search: Search,
  'square-dashed-mouse-pointer': SquareDashedMousePointer,
  'square-terminal': SquareTerminal,
  terminal: Terminal,
  'triangle-alert': TriangleAlert,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

/** A Lucide line icon at the cockpit's 1.75 stroke weight; color inherits via currentColor. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const Glyph = ICONS[name]
  return <Glyph size={size} strokeWidth={1.75} className={className} />
}
