/**
 * The local profile picture: picked from the photo library, cropped square, and copied into
 * the app's documents so it survives the picker's cache being cleared. It stays on this
 * device; nothing is uploaded to the server.
 */
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import i18n from '../i18n/i18n';
import { processingOverlayStore } from '../store/processingOverlayStore';
import { profileStore } from '../store/profileStore';

const AVATAR_PREFIX = 'profile-avatar-';

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
    new File(result.assets[0].uri).copy(target);
    deleteOldAvatar();
    profileStore.getState().setAvatar(target.uri);
    return true;
  } catch {
    processingOverlayStore.getState().showError(i18n.t('profilePhotoFailed'));
    return false;
  }
}

export function removeProfilePicture(): void {
  deleteOldAvatar();
  profileStore.getState().setAvatar(null);
}
