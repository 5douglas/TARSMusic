import { sleepTimerStore } from '../sleepTimerStore';

beforeEach(() => {
  sleepTimerStore.setState({
    endTime: null,
    endOfTrack: false,
    remaining: null,
    sheetVisible: false,
  });
});

describe('sleepTimerStore', () => {
  it('starts with inactive defaults', () => {
    const state = sleepTimerStore.getState();
    expect(state.endTime).toBeNull();
    expect(state.endOfTrack).toBe(false);
    expect(state.remaining).toBeNull();
    expect(state.sheetVisible).toBe(false);
  });

  it('setTimer sets endTime and endOfTrack', () => {
    sleepTimerStore.getState().setTimer(1700000000, false);
    const state = sleepTimerStore.getState();
    expect(state.endTime).toBe(1700000000);
    expect(state.endOfTrack).toBe(false);
  });

  it('setTimer with endOfTrack mode', () => {
    sleepTimerStore.getState().setTimer(null, true);
    const state = sleepTimerStore.getState();
    expect(state.endTime).toBeNull();
    expect(state.endOfTrack).toBe(true);
  });

  it('setRemaining updates remaining seconds', () => {
    sleepTimerStore.getState().setRemaining(120);
    expect(sleepTimerStore.getState().remaining).toBe(120);
  });

  it('setRemaining to null', () => {
    sleepTimerStore.getState().setRemaining(120);
    sleepTimerStore.getState().setRemaining(null);
    expect(sleepTimerStore.getState().remaining).toBeNull();
  });

  it('clear resets timer state', () => {
    sleepTimerStore.getState().setTimer(1700000000, false);
    sleepTimerStore.getState().setRemaining(300);
    sleepTimerStore.getState().clear();
    const state = sleepTimerStore.getState();
    expect(state.endTime).toBeNull();
    expect(state.endOfTrack).toBe(false);
    expect(state.remaining).toBeNull();
  });

  it('clear does not affect sheetVisible', () => {
    sleepTimerStore.getState().showSheet();
    sleepTimerStore.getState().clear();
    expect(sleepTimerStore.getState().sheetVisible).toBe(true);
  });

  it('showSheet sets sheetVisible to true', () => {
    sleepTimerStore.getState().showSheet();
    expect(sleepTimerStore.getState().sheetVisible).toBe(true);
  });

  it('hideSheet sets sheetVisible to false', () => {
    sleepTimerStore.getState().showSheet();
    sleepTimerStore.getState().hideSheet();
    expect(sleepTimerStore.getState().sheetVisible).toBe(false);
  });

  it('setTimer replaces previous timer', () => {
    sleepTimerStore.getState().setTimer(1700000000, false);
    sleepTimerStore.getState().setTimer(1700001000, true);
    const state = sleepTimerStore.getState();
    expect(state.endTime).toBe(1700001000);
    expect(state.endOfTrack).toBe(true);
  });
});
