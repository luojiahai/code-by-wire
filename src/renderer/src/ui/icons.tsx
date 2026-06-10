import {
  ChevronRight,
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
  type LucideIcon,
} from 'lucide-react'

/**
 * The app's curated icon set, keyed by stable kebab-case glyph names. One indirection so call sites
 * stay `<Icon name="plus" />` and the lucide imports live in one file. Names track lucide-react's
 * current exports; if one fails to resolve, check the lucide changelog (e.g. AlertTriangle was renamed
 * TriangleAlert).
 */
const ICONS = {
  'chevron-right': ChevronRight,
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
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

/** A Lucide line icon at the cockpit's 1.75 stroke weight; color inherits via currentColor. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const Glyph = ICONS[name]
  return <Glyph size={size} strokeWidth={1.75} className={className} />
}
