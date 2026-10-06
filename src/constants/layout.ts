/**
 * Shared list layout constants.
 *
 * FlashList v2 under the New Architecture measures its viewport lazily: a list
 * that starts off-screen (below a tall hero header, or nested below the fold of
 * a vertical scroller) returns an empty initial measurement and paints nothing
 * until a scroll event forces a re-measure — the rows show as blank space and
 * pop in/out while scrolling. Setting `drawDistance` renders that many points of
 * off-screen content eagerly, which sidesteps the empty initial measurement.
 *
 * Matches the 300px used by AlbumListView / PlaylistListView / ArtistListView
 * and the home-screen horizontal lists.
 */
export const LIST_DRAW_DISTANCE = 300;
