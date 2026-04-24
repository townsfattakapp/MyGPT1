export type StealthConcealMode = 'hide' | 'overlay';

export interface PrivacyState {
  stealthActive: boolean;
  protectedModeActive: boolean;
  concealMode: StealthConcealMode;
}

export interface IElectronAPI {
  sendMessage: (message: string) => void;
  Minimize: () => void;
  Maximize: () => void;
  Close: () => void;
  removeLoading: () => void;
  handleDirection: (direction: string) => void;
  on: (channel: string, callback: (data: any) => void) => void;
  getDesktopSources: (options?: { fetchThumbnail?: boolean; thumbnailSize?: { width: number; height: number } }) => Promise<Array<{ id: string; name: string; thumbnail?: string }>>;
  setCaptureMode: (isCaptureMode: boolean) => void;

  // Stealth Mode
  EnableStealth: () => void;
  DisableStealth: () => void;
  ToggleStealth: () => void;
  IsStealthActive: () => Promise<boolean>;
  onStealthChange: (callback: (isStealth: boolean) => void) => () => void;

  // Protected Privacy Mode
  SetProtectedMode: (enable: boolean) => void;
  ToggleProtectedMode: () => void;
  IsProtectedModeActive: () => Promise<boolean>;
  onProtectedModeChange: (callback: (isProtected: boolean) => void) => () => void;
  SetStealthConcealMode: (mode: StealthConcealMode) => void;
  GetStealthConcealMode: () => Promise<StealthConcealMode>;
  onStealthConcealModeChange: (callback: (mode: StealthConcealMode) => void) => () => void;
  GetPrivacyState: () => Promise<PrivacyState>;
  onPrivacyStateChange: (callback: (state: PrivacyState) => void) => () => void;
  RequestSecureRestore: (options?: { source?: string; requireConfirmation?: boolean }) => Promise<boolean>;

  // Platform info
  getPlatformInfo: () => Promise<{ platform: string; contentProtectionSupported: boolean }>;

  // Zoom
  getZoomFactor: () => number;
  setZoomFactor: (factor: number) => void;
}

declare global {
  interface Window {
    Main: IElectronAPI;
    ipcRenderer: any;
  }
}
