import {
  Activity,
  Archive,
  ArrowUpRight,
  Bot,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleUser,
  Clock,
  Code,
  Coffee,
  Coins,
  Copy,
  Database,
  Ellipsis,
  Eye,
  EyeOff,
  Filter,
  Folder,
  FolderGit2,
  FolderOpen,
  Gauge,
  GitBranch,
  GitPullRequestArrow,
  Globe,
  IdCard,
  Info,
  LoaderCircle,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Rocket,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Square,
  SquareCode,
  SquareDashedMousePointer,
  SquareTerminal,
  Sun,
  Terminal,
  Timer,
  TriangleAlert,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { forwardRef } from "react";
import type { IconName } from "./icon-names";

export type { IconName };

/** A hand-built GitHub mark — lucide ships no brand-logo icons, and this is the one spot in the app
 *  that links to the project's actual GitHub repo. Ignores stroke props (it's a filled mark, not a
 *  line icon) but still satisfies LucideIcon's shape so it drops into ICONS below like every glyph. */
const GithubMark = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  ),
);
GithubMark.displayName = "GithubMark";

/**
 * The app's curated icon set, keyed by stable kebab-case glyph names. One indirection so call sites
 * stay `<Icon name="plus" />` and the lucide imports live in one file. Names track lucide-react's
 * current exports; if one fails to resolve, check the lucide changelog (e.g. AlertTriangle was renamed
 * TriangleAlert). The name union lives in the JSX-free icon-names.ts so the node program (tests) can
 * import it; `satisfies Record<IconName, LucideIcon>` keeps this map and that union exhaustively in sync.
 */
const ICONS = {
  activity: Activity,
  archive: Archive,
  "arrow-up-right": ArrowUpRight,
  bot: Bot,
  "chart-column": ChartColumn,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "chevrons-down-up": ChevronsDownUp,
  "chevrons-up-down": ChevronsUpDown,
  "circle-user": CircleUser,
  clock: Clock,
  code: Code,
  coffee: Coffee,
  coins: Coins,
  copy: Copy,
  database: Database,
  ellipsis: Ellipsis,
  eye: Eye,
  "eye-off": EyeOff,
  filter: Filter,
  folder: Folder,
  "folder-open": FolderOpen,
  gauge: Gauge,
  github: GithubMark,
  "git-branch": GitBranch,
  "git-pull-request-arrow": GitPullRequestArrow,
  globe: Globe,
  "id-card": IdCard,
  info: Info,
  "loader-circle": LoaderCircle,
  monitor: Monitor,
  moon: Moon,
  palette: Palette,
  "panel-left": PanelLeft,
  "panel-left-close": PanelLeftClose,
  "panel-left-open": PanelLeftOpen,
  "panel-right": PanelRight,
  "panel-right-close": PanelRightClose,
  "panel-right-open": PanelRightOpen,
  pause: Pause,
  pencil: Pencil,
  pin: Pin,
  "pin-off": PinOff,
  plus: Plus,
  rocket: Rocket,
  "rotate-ccw": RotateCcw,
  "scroll-text": ScrollText,
  search: Search,
  settings: Settings,
  sparkles: Sparkles,
  square: Square,
  "square-code": SquareCode,
  "square-dashed-mouse-pointer": SquareDashedMousePointer,
  "square-terminal": SquareTerminal,
  sun: Sun,
  terminal: Terminal,
  timer: Timer,
  "triangle-alert": TriangleAlert,
  worktree: FolderGit2,
  x: X,
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
