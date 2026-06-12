import type { AppApi } from "@shared/ipc";

declare global {
  interface Window {
    api: AppApi;
  }
}

export {};
