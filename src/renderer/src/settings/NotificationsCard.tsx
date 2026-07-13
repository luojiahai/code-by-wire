import { useStore } from "@nanostores/react";
import { Card } from "../shell/page-primitives";
import { cx } from "../ui/atoms";
import { $notifyOnAwaiting, setNotifyOnAwaiting } from "../notifications/store";

/**
 * The Notifications card in Settings → System: the "notify when a session needs input" toggle.
 * Reads and writes the shared preference atom (notifications/store.ts) so the poll detector reacts
 * to a flip on the very next tick — no restart, no re-fetch. The switch anatomy mirrors the
 * Software-update card's check-on-launch row.
 */
export function NotificationsCard() {
  const enabled = useStore($notifyOnAwaiting);
  return (
    <Card title="Notifications">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="text-body text-fg">
            Notify when a session needs input
          </div>
          <div className="mt-0.5 text-meta text-fg-faint">
            Show a system notification when a session starts waiting on you
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setNotifyOnAwaiting(!enabled)}
          className={cx(
            "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
            enabled ? "bg-primary" : "bg-ink-700",
          )}
        >
          <span
            className={cx(
              "absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all",
              enabled ? "right-[2px] bg-ink-900" : "left-[2px] bg-white",
            )}
          />
        </button>
      </div>
    </Card>
  );
}
