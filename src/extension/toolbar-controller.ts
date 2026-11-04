import { mountSelectionToolbar } from '../ui/selection-toolbar';
import { supportedSite, watchSiteEnabled } from './site-settings';

export const startToolbarController = (mount = mountSelectionToolbar): (() => void) => {
  const site = supportedSite(location.href);
  if (!site) return () => undefined;
  let unmount: (() => void) | undefined;
  const stop = watchSiteEnabled(site.host, enabled => {
    if (enabled && !unmount) unmount = mount();
    if (!enabled && unmount) { unmount(); unmount = undefined; }
  });
  return () => { stop(); unmount?.(); };
};
