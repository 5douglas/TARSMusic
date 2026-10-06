import { devOptionsStore } from '../devOptionsStore';

describe('devOptionsStore', () => {
  beforeEach(() => {
    devOptionsStore.setState({ enabled: false });
  });

  it('defaults enabled to false', () => {
    expect(devOptionsStore.getState().enabled).toBe(false);
  });

  it('enable() sets enabled to true', () => {
    devOptionsStore.getState().enable();
    expect(devOptionsStore.getState().enabled).toBe(true);
  });

  it('enable() is idempotent', () => {
    devOptionsStore.getState().enable();
    devOptionsStore.getState().enable();
    expect(devOptionsStore.getState().enabled).toBe(true);
  });
});
