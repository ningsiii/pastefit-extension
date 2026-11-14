import { describe, expect, it } from 'vitest';
import manifest from '../../public/manifest.json';

describe('extension policy', () => {
  it('uses only the required permission and explicit ChatGPT host scope', () => {
    expect(manifest.permissions).toEqual(['clipboardWrite', 'activeTab', 'scripting', 'contextMenus', 'storage']);
    expect(manifest.optional_permissions).toEqual(['nativeMessaging']);
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest.optional_host_permissions).toEqual(['https://*/*']);
    expect(manifest.options_ui).toEqual({ page: 'options.html', open_in_tab: true });
    expect(manifest.version).toBe('0.1.3');
  });

  it('has no forbidden remote or code-generation features in project sources', async () => {
    const sources = import.meta.glob('../../src/**/*.{ts,js}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
    const combined = Object.values(sources).join('\n');
    for (const prohibited of ['clipboardRead', '<all_urls>', 'new Function', 'eval(', 'localStorage', 'sessionStorage', 'fetch(']) {
      expect(combined).not.toContain(prohibited);
    }
    // Only explicit settings and a native readiness boolean may be persisted; never content.
    const storageWriters = Object.entries(sources).filter(([, source]) => source.includes('chrome.storage.local.set'));
    expect(storageWriters.map(([path]) => path).sort()).toEqual([
      '../../src/clipboard/copy-target.ts',
      '../../src/clipboard/formula-preference.ts',
      '../../src/extension/pages-native-service.ts',
      '../../src/extension/site-settings.ts'
    ]);
    expect(sources['../../src/clipboard/copy-target.ts']).toContain('chrome.storage.local.set({ [copyTargetKey]: target })');
    expect(sources['../../src/extension/pages-native-service.ts']).toContain("const readyKey = 'pastefit.nativeReady'");
    expect(combined).not.toContain('chrome.storage.sync');
  });
});
