interface Window { __pastefitAction?: 'chat' | 'smart' | 'edit'; __pastefitStopToolbar?: () => void }
interface RegisteredScript { id: string; matches?: string[]; js?: string[]; runAt?: 'document_idle'; persistAcrossSessions?: boolean }
interface ChromeMenuInfo { menuItemId: string | number; frameId?: number }
interface ChromeTab { id?: number; url?: string }
interface ChromeLike {
  tabs: { query(query: { active: boolean; currentWindow: boolean }): Promise<ChromeTab[]> };
  storage: {
    local: { get(keys: string | string[] | null): Promise<Record<string, unknown>>; set(values: Record<string, boolean>): Promise<void>; remove(key: string): Promise<void> };
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
    request(value: { origins: string[] }): Promise<boolean>;
    contains(value: { origins: string[] }): Promise<boolean>;
    remove(value: { origins: string[] }): Promise<boolean>;
    onRemoved: { addListener(listener: () => void): void };
  };
  runtime: {
    id: string;
    getManifest(): { version: string };
    openOptionsPage(): Promise<void>;
    sendMessage(message: { type: string }): Promise<{ ok: boolean }>;
    onMessage: { addListener(listener: (message: { type?: string }, sender: { id?: string }, reply: (result: { ok: boolean }) => void) => boolean | undefined): void };
    onStartup: { addListener(listener: () => void): void };
    onInstalled: { addListener(listener: () => void): void };
  };
  action: { setBadgeText(details: { tabId: number; text: string }): Promise<void>; setTitle(details: { tabId: number; title: string }): Promise<void> };
  scripting: {
    getRegisteredContentScripts(): Promise<RegisteredScript[]>;
    registerContentScripts(scripts: RegisteredScript[]): Promise<void>;
    unregisterContentScripts(value: { ids: string[] }): Promise<void>;
    executeScript(details: { target: { tabId: number; frameIds?: number[] }; files?: string[]; func?: (mode: 'chat' | 'smart' | 'edit') => void; args?: ('chat' | 'smart' | 'edit')[] }): Promise<unknown[]>;
  };
}

declare const chrome: ChromeLike;
