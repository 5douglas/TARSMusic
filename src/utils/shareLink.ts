/**
 * TARSMusic share links: one address per song, album, artist or playlist on the
 * user's Navidrome server.
 *
 *   https://<Discover address>/s/<kind>/<id>
 *
 * The Discover service answers that address with a small page (cover, name and an
 * "Open in TARSMusic" button) for people opening it in a browser, and the Android
 * app claims the same addresses so a tap opens the item straight in the app. Without
 * a Discover address the link falls back to the app's own scheme, which only opens
 * on a device that has TARSMusic installed.
 *
 * Ids are the server's ids, so a link opens the same item for every user of that
 * server.
 */

export type ShareLinkKind = 'song' | 'album' | 'artist' | 'playlist';

export interface ShareLinkTarget {
  kind: ShareLinkKind;
  id: string;
}

export const SHARE_LINK_SCHEME = 'substreamer';

const KINDS: readonly ShareLinkKind[] = ['song', 'album', 'artist', 'playlist'];

/** The share link for an item, on the Discover address when one is set. */
export function buildShareLink(kind: ShareLinkKind, id: string, discoverBaseUrl: string | null): string {
  const path = `s/${kind}/${encodeURIComponent(id)}`;
  const base = discoverBaseUrl?.trim().replace(/\/+$/, '');
  return base ? `${base}/${path}` : `${SHARE_LINK_SCHEME}://${path}`;
}

/**
 * The first share link in a piece of text (a link on its own, or a message with a
 * link in it), or null. Accepts any host, since the Discover address can change.
 */
export function parseShareLink(text: string | null | undefined): ShareLinkTarget | null {
  if (!text) return null;
  const match = /(?:https?:\/\/[^\s/]+\/|substreamer:\/\/\/?|^\/?)s\/(song|album|artist|playlist)\/([^\s/?#]+)/i.exec(
    text.trim(),
  );
  if (!match) return null;
  const kind = match[1].toLowerCase() as ShareLinkKind;
  if (!KINDS.includes(kind)) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  return id ? { kind, id } : null;
}
