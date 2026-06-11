import {
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitPullRequestArrow,
  Info,
  MessagesSquare,
  Pause,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Square,
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
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  code: Code,
  copy: Copy,
  'folder-open': FolderOpen,
  github: FolderGit2,
  'git-branch': GitBranch,
  'git-pull-request-arrow': GitPullRequestArrow,
  info: Info,
  'messages-square': MessagesSquare,
  pause: Pause,
  pencil: Pencil,
  plus: Plus,
  'refresh-cw': RefreshCw,
  search: Search,
  square: Square,
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
