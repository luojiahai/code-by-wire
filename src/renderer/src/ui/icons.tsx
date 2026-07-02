import {
  Activity,
  Archive,
  ArrowUpRight,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  CircleUser,
  Clock,
  Code,
  Coins,
  Copy,
  Eye,
  EyeOff,
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
  MessagesSquare,
  Monitor,
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
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Square,
  SquareDashedMousePointer,
  SquareTerminal,
  Terminal,
  Timer,
  TriangleAlert,
  X,
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
  activity: Activity,
  archive: Archive,
  "arrow-up-right": ArrowUpRight,
  "chart-column": ChartColumn,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "circle-dollar-sign": CircleDollarSign,
  "circle-user": CircleUser,
  clock: Clock,
  code: Code,
  coins: Coins,
  copy: Copy,
  eye: Eye,
  "eye-off": EyeOff,
  folder: Folder,
  "folder-open": FolderOpen,
  gauge: Gauge,
  github: FolderGit2,
  "git-branch": GitBranch,
  "git-pull-request-arrow": GitPullRequestArrow,
  globe: Globe,
  "id-card": IdCard,
  info: Info,
  "loader-circle": LoaderCircle,
  "messages-square": MessagesSquare,
  monitor: Monitor,
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
  plus: Plus,
  "rotate-ccw": RotateCcw,
  search: Search,
  settings: Settings,
  sparkles: Sparkles,
  square: Square,
  "square-dashed-mouse-pointer": SquareDashedMousePointer,
  "square-terminal": SquareTerminal,
  terminal: Terminal,
  timer: Timer,
  "triangle-alert": TriangleAlert,
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
