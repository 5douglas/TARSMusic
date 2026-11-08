import { useEffect } from 'react';

import { openShareTarget } from '../services/shareLinkService';
import { pendingShareLinkStore } from '../store/pendingShareLinkStore';
import { parseShareLink } from '../utils/shareLink';

/** Share links handed over by the Windows app's main process (see desktop/main.js). */
interface DesktopLinks {
  take: () => Promise<string | null>;
  onLink: (listener: (url: string) => void) => () => void;
}

function desktopLinks(): DesktopLinks | undefined {
  return (globalThis as { tarsDesktopLinks?: DesktopLinks }).tarsDesktopLinks;
}

/**
 * Opens TARSMusic share links that arrived from outside the app, once startup has
 * settled and the user is signed in. Links that come earlier wait in
 * pendingShareLinkStore.
 */
export function useShareLinkHandler(ready: boolean): void {
  const pending = pendingShareLinkStore((s) => s.pending);

  // Windows: links from the browser page's "Open in TARSMusic" button.
  useEffect(() => {
    const links = desktopLinks();
    if (!links) return;
    const hold = (url: string | null) => {
      const target = parseShareLink(url);
      if (target) pendingShareLinkStore.getState().setPending(target);
    };
    links.take().then(hold).catch(() => {});
    return links.onLink(hold);
  }, []);

  useEffect(() => {
    if (!ready || !pending) return;
    // Let the start screen finish its redirect to the tabs before pushing on top of it.
    const timer = setTimeout(() => {
      pendingShareLinkStore.getState().setPending(null);
      openShareTarget(pending).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, pending]);
}
