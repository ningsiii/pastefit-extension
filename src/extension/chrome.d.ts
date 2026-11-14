interface NativeBridgePort { postMessage(message: { type: string }): void; disconnect(): void; onMessage: { addListener(listener: (value: NativeBridgeReply) => void): void }; onDisconnect: { addListener(listener: () => void): void } }
interface NativeBridgeState { protocol: number; version: string; accessibility: boolean; automation: 'granted' | 'required' | 'denied' | 'not-running' | 'unavailable'; pagesInstalled: boolean }
interface NativeBridgeReply { ok: boolean; code?: string; state?: NativeBridgeState; tested?: boolean }
interface Window { __pastefitAction?: 'chat' | 'smart' | 'document' | 'pages' | 'edit'; __pastefitStopToolbar?: () => void }
interface RegisteredScript { id: string; matches?: string[]; js?: string[]; runAt?: 'document_idle'; persistAcrossSessions?: boolean }
interface ChromeMenuInfo { menuItemId: string | number; frameId?: number }
interface ChromeTab { id?: number; url?: string }
interface ChromeLike {
  tabs: { query(query: { active: boolean; currentWindow: boolean }): Promise<ChromeTab[]>; create(options: { url: string }): Promise<ChromeTab> };
  storage: {
    local: { get(keys: string | string[] | null): Promise<Record<string, unknown>>; set(values: Record<string, boolean | 'office' | 'wps' | 'pages'>): Promise<void>; remove(key: string): Promise<void> };
    onChanged: {
      addListener(listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
      removeListener(listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
    };
  };
  contextMenus: {
    removeAll(callback: () => void): void;
    create(properties: { id: string; title: string; contexts: string[] }): void;
    onClicked: { addListener(listener: (info: ChromeMenuInfo, tab: ChromeTab) => void): void };
  };
  permissions: {
    request(value: { origins: string[] } | { permissions: string[] }): Promise<boolean>;
    contains(value: { origins: string[] } | { permissions: string[] }): Promise<boolean>;
    remove(value: { origins: string[] } | { permissions: string[] }): Promise<boolean>;
    onRemoved: { addListener(listener: () => void): void };
  };
  runtime: {
    id: string;
    lastError?: { message?: string };
    connectNative(host: string): NativeBridgePort;
    getManifest(): { version: string };
    openOptionsPage(): Promise<void>;
    getURL(path: string): string;
    sendMessage(message: { type: string; documentXml?: string; html?: string; plain?: string; command?: string }): Promise<NativeBridgeReply>;
    sendNativeMessage(host: string, message: { type: string; documentXml?: string; html?: string; plain?: string; command?: string }): Promise<NativeBridgeReply>;
    onMessage: { addListener(listener: (message: { type?: string; documentXml?: unknown; html?: unknown; plain?: unknown; command?: unknown }, sender: { id?: string; url?: string }, reply: (result: NativeBridgeReply) => void) => boolean | undefined): void };
    onStartup: { addListener(listener: () => void): void };
    onInstalled: { addListener(listener: () => void): void };
  };
  action: { setBadgeText(details: { tabId: number; text: string }): Promise<void>; setTitle(details: { tabId: number; title: string }): Promise<void> };
  scripting: {
    getRegisteredContentScripts(): Promise<RegisteredScript[]>;
    registerContentScripts(scripts: RegisteredScript[]): Promise<void>;
    unregisterContentScripts(value: { ids: string[] }): Promise<void>;
    executeScript(details: { target: { tabId: number; frameIds?: number[] }; files?: string[]; func?: (mode: 'chat' | 'smart' | 'document' | 'pages' | 'edit') => void; args?: ('chat' | 'smart' | 'document' | 'pages' | 'edit')[] }): Promise<unknown[]>;
  };
}

declare const chrome: ChromeLike;
