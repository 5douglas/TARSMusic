import { tabletLayoutStore } from '../tabletLayoutStore';

beforeEach(() => {
  tabletLayoutStore.setState({ playerExpanded: false });
});

describe('tabletLayoutStore', () => {
  it('defaults playerExpanded to false', () => {
    expect(tabletLayoutStore.getState().playerExpanded).toBe(false);
  });

  it('setPlayerExpanded sets the value', () => {
    tabletLayoutStore.getState().setPlayerExpanded(true);
    expect(tabletLayoutStore.getState().playerExpanded).toBe(true);

    tabletLayoutStore.getState().setPlayerExpanded(false);
    expect(tabletLayoutStore.getState().playerExpanded).toBe(false);
  });

  it('togglePlayerExpanded flips the value', () => {
    expect(tabletLayoutStore.getState().playerExpanded).toBe(false);

    tabletLayoutStore.getState().togglePlayerExpanded();
    expect(tabletLayoutStore.getState().playerExpanded).toBe(true);

    tabletLayoutStore.getState().togglePlayerExpanded();
    expect(tabletLayoutStore.getState().playerExpanded).toBe(false);
  });
});
