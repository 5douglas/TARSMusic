import { filterBarStore } from '../filterBarStore';

beforeEach(() => {
  filterBarStore.setState({
    downloadedOnly: false,
    favoritesOnly: false,
    hideDownloaded: false,
    hideFavorites: false,
    layoutToggle: null,
    downloadButtonConfig: null,
  });
});

describe('filterBarStore', () => {
  it('toggleDownloaded flips from false to true', () => {
    filterBarStore.getState().toggleDownloaded();
    expect(filterBarStore.getState().downloadedOnly).toBe(true);
  });

  it('toggleDownloaded flips from true to false', () => {
    filterBarStore.setState({ downloadedOnly: true });
    filterBarStore.getState().toggleDownloaded();
    expect(filterBarStore.getState().downloadedOnly).toBe(false);
  });

  it('toggleFavorites flips from false to true', () => {
    filterBarStore.getState().toggleFavorites();
    expect(filterBarStore.getState().favoritesOnly).toBe(true);
  });

  it('toggleFavorites flips from true to false', () => {
    filterBarStore.setState({ favoritesOnly: true });
    filterBarStore.getState().toggleFavorites();
    expect(filterBarStore.getState().favoritesOnly).toBe(false);
  });

  it('setDownloadedOnly sets directly', () => {
    filterBarStore.getState().setDownloadedOnly(true);
    expect(filterBarStore.getState().downloadedOnly).toBe(true);
  });

  it('setHideDownloaded updates state', () => {
    filterBarStore.getState().setHideDownloaded(true);
    expect(filterBarStore.getState().hideDownloaded).toBe(true);
  });

  it('setHideFavorites updates state', () => {
    filterBarStore.getState().setHideFavorites(true);
    expect(filterBarStore.getState().hideFavorites).toBe(true);
  });

  it('setLayoutToggle sets config', () => {
    const config = { layout: 'grid' as const, onToggle: jest.fn() };
    filterBarStore.getState().setLayoutToggle(config);
    expect(filterBarStore.getState().layoutToggle).toBe(config);
  });

  it('setLayoutToggle to null clears', () => {
    filterBarStore.getState().setLayoutToggle({ layout: 'list', onToggle: jest.fn() });
    filterBarStore.getState().setLayoutToggle(null);
    expect(filterBarStore.getState().layoutToggle).toBeNull();
  });

  it('setDownloadButtonConfig sets config', () => {
    const config = {
      itemId: 'a1',
      type: 'album' as const,
      onDownload: jest.fn(),
      onDelete: jest.fn(),
    };
    filterBarStore.getState().setDownloadButtonConfig(config);
    expect(filterBarStore.getState().downloadButtonConfig).toBe(config);
  });
});
