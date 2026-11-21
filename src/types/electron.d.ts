import type { SystemTelemetryResult } from "./telemetry";

export interface NetPulseElectronAPI {
  isElectron: boolean;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  getAppInfo: () => Promise<{
    isElectron: boolean;
    platform: string;
    arch: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    appVersion: string;
  }>;
  getSystemTelemetry: () => Promise<SystemTelemetryResult>;
  openExternal: (url: string) => Promise<boolean>;
  exportPdf: (suggestedName?: string) => Promise<{
    ok?: boolean;
    saved: boolean;
    canceled?: boolean;
    filePath?: string;
    error?: string;
  }>;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    netpulseElectron?: NetPulseElectronAPI;
  }
}

export {};
