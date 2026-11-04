import { describe, it, expect } from 'vitest';
import '../../src/extension/content';
import manifest from '../../public/manifest.json';

describe('Smoke Test', () => {
  it('should run tests and access DOM', () => {
    document.body.innerHTML = '<div>Hello PasteFit</div>';
    expect(document.querySelector('div')?.textContent).toBe('Hello PasteFit');
  });

  it('uses optional site access instead of automatic MV3 content injection', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest.optional_host_permissions).toEqual(['https://*/*']);
  });
});
