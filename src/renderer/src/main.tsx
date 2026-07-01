import React from "react";
import { createRoot } from "react-dom/client";
// Bundle the mono UI font as an asset so the app renders identically offline — no remote CDN, no
// FOUT on a cold start. JetBrains Mono (telemetry, code, diffs, terminal) ships as a one-axis
// variable build. UI/body text uses the OS system sans (see --font-sans in index.css), so no
// sans webfont is bundled.
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
