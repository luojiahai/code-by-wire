import {
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
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
  Search,
  Square,
  SquareDashedMousePointer,
  SquareTerminal,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "./icon-names";

export type { IconName };

/**
 * The app's curated icon set, keyed by stable kebab-case glyph names. One indirection so call sites
 * stay `<Icon name="plus" />` and the lucide imports live in one file. Names track lucide-react's
 * current exports; if one fails to resolve, check the lucide changelog (e.g. AlertTriangle was renamed
 * TriangleAlert). The name union lives in the JSX-free icon-names.ts so the node program (tests) can
 * import it; `satisfies Record<IconName, LucideIcon>` keeps this map and that union exhaustively in sync.
 */
const ICONS = {
  "chart-column": ChartColumn,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  code: Code,
  copy: Copy,
  "folder-open": FolderOpen,
  github: FolderGit2,
  "git-branch": GitBranch,
  "git-pull-request-arrow": GitPullRequestArrow,
  info: Info,
  "messages-square": MessagesSquare,
  pause: Pause,
  pencil: Pencil,
  plus: Plus,
  search: Search,
  square: Square,
  "square-dashed-mouse-pointer": SquareDashedMousePointer,
  "square-terminal": SquareTerminal,
  terminal: Terminal,
} satisfies Record<IconName, LucideIcon>;

/** A Lucide line icon at the cockpit's 1.75 stroke weight; color inherits via currentColor. */
export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={1.75} className={className} />;
}
