/**
 * Shared Jest automatic mock for musicbrainzService.
 *
 * All functions return null by default.
 * Override per-test with mockResolvedValue / mockResolvedValueOnce.
 */

export const searchArtistMBID = jest.fn().mockResolvedValue(null);
export const searchArtists = jest.fn().mockResolvedValue([]);
export const searchReleaseGroups = jest.fn().mockResolvedValue([]);
export const getArtistBiography = jest.fn().mockResolvedValue(null);
export const getAlbumDescription = jest.fn().mockResolvedValue(null);
export const searchReleaseGroupMBID = jest.fn().mockResolvedValue(null);
export const getReleaseGroupIdForRelease = jest.fn().mockResolvedValue(null);
export const getWikidataIdForReleaseGroup = jest.fn().mockResolvedValue(null);
export const getWikipediaExtractForAlbum = jest.fn().mockResolvedValue(null);
