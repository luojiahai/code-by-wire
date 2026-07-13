import { BrowserWindow, Notification } from "electron";
import { IPC, type NotifyShowRequest } from "@shared/ipc";

/** The main-side half of session notifications. Show is invoked request/response from the
 *  renderer's poll (the transition decision lives there — see notifications/decide.ts), so no
 *  timer or watcher runs here; the only main→renderer traffic is the click push. */
export interface Notifier {
  show(req: NotifyShowRequest): void;
}

/**
 * Native OS notifications for sessions that started awaiting input. Clicking one focuses the app
 * window and pushes the session id back to the renderer (notifyActivate), which selects it. The
 * window is resolved at click time — not at show time — the same late binding the update push uses,
 * so a notification outliving its window (closed, reopened on macOS activate) still lands on
 * whatever window exists then.
 */
export function createNotifier(): Notifier {
  return {
    show(req) {
      // Unsupported platform (some Linux setups): silently no-op — the renderer fires and forgets,
      // and there is nothing actionable to surface.
      if (!Notification.isSupported()) return;
      const n = new Notification({ title: req.title, body: req.body });
      n.on("click", () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win || win.isDestroyed()) return;
        // Restore before focus: a minimized window ignores focus() on some platforms.
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        win.webContents.send(IPC.notifyActivate, req.sessionId);
      });
      n.show();
    },
  };
}
