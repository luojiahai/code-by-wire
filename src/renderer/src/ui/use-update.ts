import { useEffect, useState } from "react";
import type { UpdateState } from "@shared/update";
import type { UpdateControls } from "../settings/SoftwareUpdateCard";

const INITIAL: UpdateState = {
  currentVersion: "",
  phase: { kind: "unsupported" },
};

/** Reads the initial update state + auto-check preference, subscribes to update-state pushes, and
 *  exposes the actions. One instance lives in App and is shared by the header badge and the About card. */
export function useUpdate(): UpdateControls {
  const [state, setState] = useState<UpdateState>(INITIAL);
  const [autoCheck, setAutoCheck] = useState(true);

  useEffect(() => {
    let pushReceived = false;
    const unsub = window.api.onUpdateState((s) => {
      pushReceived = true;
      setState(s);
    });
    void window.api.getUpdateState().then((s) => {
      if (!pushReceived) setState(s);
    });
    void window.api.getAutoCheckUpdates().then(setAutoCheck);
    return unsub;
  }, []);

  return {
    state,
    autoCheck,
    check: () => void window.api.checkForUpdate().then(setState),
    download: () => void window.api.downloadUpdate(),
    install: () => window.api.installUpdate(),
    setAutoCheck: (enabled) => {
      setAutoCheck(enabled);
      void window.api.setAutoCheckUpdates(enabled);
    },
  };
}
