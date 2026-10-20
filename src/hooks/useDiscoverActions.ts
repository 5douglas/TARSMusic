import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toggleDiscoverPreview } from '../services/discoverPreviewService';
import { queueDiscoverDownload } from '../services/discoverService';
import { playbackToastStore } from '../store/playbackToastStore';
import { themedAlertStore } from '../store/themedAlertStore';

import type {
  DiscoverAlbum,
  DiscoverArtist,
  DiscoverItem,
  DiscoverPlaylistCard,
} from '../services/discoverService';

/** Preview, confirm-then-download and open handlers shared by the Discover screens. */
export function useDiscoverActions() {
  const { t } = useTranslation();
  const router = useRouter();

  const confirmDownload = useCallback(
    (url: string, name: string, artist: string, wholeAlbum: boolean) => {
      themedAlertStore.getState().show(
        wholeAlbum ? t('discoverDownloadAlbumTitle') : t('discoverDownloadTrackTitle'),
        `${name} · ${artist}`,
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('discoverDownload'),
            onPress: () => {
              void queueDiscoverDownload(url).then((ok) => {
                if (ok) playbackToastStore.getState().flashSuccess(t('discoverDownloadQueued'));
                else themedAlertStore.getState().show(t('discoverDownloadFailed'), undefined, [{ text: t('ok') }]);
              });
            },
          },
        ],
      );
    },
    [t],
  );

  const handlePreview = useCallback((item: DiscoverItem) => {
    void toggleDiscoverPreview(item.id);
  }, []);

  const handleTrackDownload = useCallback(
    (item: DiscoverItem, wholeAlbum: boolean) => {
      if (wholeAlbum && item.album_link) confirmDownload(item.album_link, item.album, item.artist, true);
      else confirmDownload(item.link, item.title, item.artist, false);
    },
    [confirmDownload],
  );

  const handleAlbumDownload = useCallback(
    (album: DiscoverAlbum) => confirmDownload(album.link, album.title, album.artist, true),
    [confirmDownload],
  );

  const handleOpen = useCallback(
    (entity: DiscoverAlbum | DiscoverArtist | DiscoverPlaylistCard) => {
      router.push({
        pathname: '/discover-browse',
        params:
          entity.type === 'mix' || entity.type === 'chart'
            ? { kind: 'playlist', path: entity.path, title: entity.title }
            : { kind: entity.type, id: String(entity.id), title: entity.title },
      });
    },
    [router],
  );

  return { handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen };
}
