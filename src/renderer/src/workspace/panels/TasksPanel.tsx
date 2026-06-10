import type { Task } from '@shared/types'
import { cx } from '../../ui/atoms'
import { PanelSection, PanelHeading } from './chrome'

/** Glyph + tone per task status, reusing the app's palette (no new color tokens). */
const GLYPH: Record<Task['status'], string> = { completed: '✓', in_progress: '◐', blocked: '⊘', pending: '○' }
const GLYPH_TONE: Record<Task['status'], string> = {
  completed: 'text-fg-faint',
  in_progress: 'text-primary-bright',
  blocked: 'text-accent-bright',
  pending: 'text-fg-muted',
}
const SUBJECT_TONE: Record<Task['status'], string> = {
  completed: 'text-fg-faint line-through',
  in_progress: 'text-fg',
  blocked: 'text-fg-muted',
  pending: 'text-fg',
}

/** The session's task list with status and blockedBy dependencies. Hidden when there are no tasks. */
export function TasksPanel({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return null
  const done = tasks.filter((t) => t.status === 'completed').length
  return (
    <PanelSection>
      <div className="flex items-baseline justify-between gap-2">
        <PanelHeading>Tasks</PanelHeading>
        <span className="font-mono text-[10px] tabular-nums text-fg-faint">
          {done}/{tasks.length}
        </span>
      </div>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-baseline gap-2">
            <span className={cx('shrink-0 font-mono text-[11px]', GLYPH_TONE[t.status])}>{GLYPH[t.status]}</span>
            <div className="min-w-0 flex-1">
              <p className={cx('truncate text-[12px]', SUBJECT_TONE[t.status])} title={t.subject}>
                {t.subject}
              </p>
              {t.blockedBy && t.blockedBy.length > 0 && (
                <p className="text-[10px] text-fg-faint">blocked by {t.blockedBy.join(', ')}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </PanelSection>
  )
}
