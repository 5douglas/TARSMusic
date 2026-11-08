import { pendingShareLinkStore } from '../store/pendingShareLinkStore';
import { parseShareLink } from '../utils/shareLink';

/**
 * Links that open the app from outside (a TARSMusic share link tapped in WhatsApp,
 * the "Open in TARSMusic" button on the link's web page). Share links are held until
 * the app has started and the user is signed in, then opened by useShareLinkHandler;
 * every other link keeps Expo Router's default handling.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const target = parseShareLink(path);
    if (target) {
      pendingShareLinkStore.getState().setPending(target);
      // A cold start goes through the normal start screen; a running app stays where it is.
      return initial ? '/' : null;
    }
  } catch {
    /* fall through to the default handling */
  }
  return path;
}
