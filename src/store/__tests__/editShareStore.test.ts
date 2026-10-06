import { editShareStore } from '../editShareStore';

import { type Share } from '../../services/subsonicService';

const mockShare = { id: 'sh1', url: 'https://example.com/share/sh1' } as Share;

beforeEach(() => {
  editShareStore.setState({ visible: false, share: null });
});

describe('editShareStore', () => {
  it('show sets visible and share', () => {
    editShareStore.getState().show(mockShare);
    const state = editShareStore.getState();
    expect(state.visible).toBe(true);
    expect(state.share).toBe(mockShare);
  });

  it('hide resets visible and share', () => {
    editShareStore.getState().show(mockShare);
    editShareStore.getState().hide();
    const state = editShareStore.getState();
    expect(state.visible).toBe(false);
    expect(state.share).toBeNull();
  });
});
