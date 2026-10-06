import { create } from 'zustand';

type RatableType = 'song' | 'album' | 'artist';

interface SetRatingState {
  visible: boolean;
  entityType: RatableType | null;
  entityId: string | null;
  entityName: string | null;
  coverArtId: string | null;
  currentRating: number;

  show: (type: RatableType, id: string, name: string, rating: number, coverArtId?: string) => void;
  hide: () => void;
}

export const setRatingStore = create<SetRatingState>()((set) => ({
  visible: false,
  entityType: null,
  entityId: null,
  entityName: null,
  coverArtId: null,
  currentRating: 0,

  show: (entityType, entityId, entityName, currentRating, coverArtId) =>
    set({ visible: true, entityType, entityId, entityName, currentRating, coverArtId: coverArtId ?? null }),

  hide: () =>
    set({
      visible: false,
      entityType: null,
      entityId: null,
      entityName: null,
      coverArtId: null,
      currentRating: 0,
    }),
}));
