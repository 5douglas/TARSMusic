/**
 * The profile picture: picked from the photo library, cropped square, shrunk and saved in the
 * app's documents so it survives the picker's cache being cleared, then sent to the server
 * (`profileSyncService`) so every device signed in to the account shows it.
 */
import { File, Paths } from 'expo-file-system';
import { resizeImageToFileAsync } from 'expo-image-resize';
import * as ImagePicker from 'expo-image-picker';

import i18n from '../i18n/i18n';
import { processingOverlayStore } from '../store/processingOverlayStore';
import { profileStore } from '../store/profileStore';
import { AVATAR_PREFIX, pushProfileToServer } from './profileSyncService';

/** Big enough for any avatar on screen, small enough to travel in a playlist comment. */
const AVATAR_SIZE = 384;
const AVATAR_QUALITY = 0.8;

function deleteOldAvatar(): void {
  const old = profileStore.getState().avatarUri;
  if (!old) return;
  try {
    const file = new File(old);
    if (file.exists) file.delete();
  } catch {
    // A stale file only costs a little storage.
  }
}

/** Lets the user pick a photo; resolves true when a new picture was saved. */
export async function pickProfilePicture(): Promise<boolean> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return false;
  try {
    // A fresh name per picture, so image caches never show the previous one.
    const target = new File(Paths.document, `${AVATAR_PREFIX}${Date.now()}.jpg`);
    try {
      await resizeImageToFileAsync(result.assets[0].uri, target.uri, AVATAR_SIZE, AVATAR_QUALITY);
    } catch {
      // Not a decodable JPEG for the resizer: keep the picker's file as it is.
      new File(result.assets[0].uri).copy(target);
    }
    deleteOldAvatar();
    profileStore.getState().setAvatar(target.uri);
    void pushProfileToServer();
    return true;
  } catch {
    processingOverlayStore.getState().showError(i18n.t('profilePhotoFailed'));
    return false;
  }
}

export function removeProfilePicture(): void {
  deleteOldAvatar();
  profileStore.getState().setAvatar(null);
  void pushProfileToServer();
}
