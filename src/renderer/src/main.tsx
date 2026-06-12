import React from "react";
import { createRoot } from "react-dom/client";
// Bundle the UI fonts as assets so the app renders identically offline — no remote CDN, no FOUT on a
// cold start. The variable builds cover the 400–700 weights the design uses, on one axis each.
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
