/**
 * Sharing songs, albums, artists and playlists as links, and opening those links
 * in the app (from another app, from a browser, or from inside TARSMusic).
 */
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Platform, Share } from 'react-native';

import i18n from '../i18n/i18n';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { playbackToastStore } from '../store/playbackToastStore';
import { buildShareLink, parseShareLink, type ShareLinkKind, type ShareLinkTarget } from '../utils/shareLink';
import { playTrack } from './playerService';
import { getAlbum, getSong } from './subsonicService';

export interface ShareableItem {
  kind: ShareLinkKind;
  id: string;
  name: string;
  /** Artist of a song or album; left out for artists and playlists. */
  artist?: string | null;
}

/** The link for an item, on the Discover address the user set. */
export function shareLinkFor(kind: ShareLinkKind, id: string): string {
  return buildShareLink(kind, id, discoverSettingsStore.getState().baseUrl);
}

/** The message that goes with a shared link, e.g. `Ouça "Song" de Artist`. */
export function shareMessageFor(item: ShareableItem): string {
  const t = i18n.t.bind(i18n);
  switch (item.kind) {
    case 'song':
      return item.artist
        ? t('shareMessageSongWithArtist', { song: item.name, artist: item.artist })
        : t('shareMessageSong', { song: item.name });
    case 'album':
      return item.artist
        ? t('shareMessageAlbumWithArtist', { album: item.name, artist: item.artist })
        : t('shareMessageAlbum', { album: item.name });
    case 'artist':
      return t('shareMessageArtist', { artist: item.name });
    case 'playlist':
      return t('shareMessagePlaylist', { playlist: item.name });
  }
}

/** Copies an item's link, with its message, and confirms with a toast. */
export async function copyShareLink(item: ShareableItem): Promise<void> {
  const link = shareLinkFor(item.kind, item.id);
  await Clipboard.setStringAsync(`${shareMessageFor(item)}\n${link}`);
  playbackToastStore.getState().flashSuccess(i18n.t('shareLinkCopied'));
}

/**
 * Shares an item's link: the system share sheet on the phone (WhatsApp, Telegram,
 * e-mail...), the clipboard on Windows, which has no share sheet.
 */
export async function shareItemLink(item: ShareableItem): Promise<void> {
  if (Platform.OS === 'web') {
    await copyShareLink(item);
    return;
  }
  const link = shareLinkFor(item.kind, item.id);
  const text = shareMessageFor(item);
  // Android takes only `message`, so the link goes in it; iOS shows `url` as the link.
  const message = Platform.OS === 'android' ? `${text}\n${link}` : text;
  await Share.share({ message, url: link, title: item.name }, { subject: text }).catch(() => {
    /* dismissed */
  });
}

/* ------------------------------------------------------------------ */
/*  Opening links                                                      */
/* ------------------------------------------------------------------ */

/** Opens what a link points at. Songs start playing and their album opens. */
export async function openShareTarget(target: ShareLinkTarget): Promise<boolean> {
  switch (target.kind) {
    case 'album':
      router.push(`/album/${encodeURIComponent(target.id)}`);
      return true;
    case 'artist':
      router.push(`/artist/${encodeURIComponent(target.id)}`);
      return true;
    case 'playlist':
      router.push(`/playlist/${encodeURIComponent(target.id)}`);
      return true;
    case 'song': {
      const song = await getSong(target.id);
      if (!song) {
        playbackToastStore.getState().fail();
        return false;
      }
      const album = song.albumId ? await getAlbum(song.albumId) : null;
      const queue = album?.song?.length ? album.song : [song];
      const track = queue.find((s) => s.id === song.id) ?? song;
      await playTrack(track, queue.includes(track) ? queue : [track]);
      if (song.albumId) router.push(`/album/${encodeURIComponent(song.albumId)}`);
      return true;
    }
  }
}

/**
 * Opens a TARSMusic link found in a piece of text (a chat message, a pasted link).
 * Returns false when the text holds no TARSMusic link.
 */
export async function openShareLink(text: string): Promise<boolean> {
  const target = parseShareLink(text);
  if (!target) return false;
  return openShareTarget(target);
}
