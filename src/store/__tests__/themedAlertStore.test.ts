import { themedAlertStore } from '../themedAlertStore';

describe('themedAlertStore', () => {
  beforeEach(() => {
    themedAlertStore.setState({
      visible: false,
      title: '',
      message: undefined,
      buttons: [],
    });
  });

  it('show populates fields and flips visible true', () => {
    const onPress = jest.fn();
    themedAlertStore.getState().show('Title', 'Message', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', style: 'destructive', onPress },
    ]);

    const state = themedAlertStore.getState();
    expect(state.visible).toBe(true);
    expect(state.title).toBe('Title');
    expect(state.message).toBe('Message');
    expect(state.buttons).toHaveLength(2);
    expect(state.buttons[1].onPress).toBe(onPress);
  });

  it('show accepts undefined message', () => {
    themedAlertStore.getState().show('Confirm', undefined, [{ text: 'OK' }]);
    expect(themedAlertStore.getState().message).toBeUndefined();
  });

  it('hide flips visible false but leaves payload intact for fade-out animation', () => {
    themedAlertStore.getState().show('Title', 'Message', [{ text: 'OK' }]);
    themedAlertStore.getState().hide();

    const state = themedAlertStore.getState();
    expect(state.visible).toBe(false);
    // Title / buttons persist so the closing alert can fade out cleanly
    // without flashing empty content during the dismiss animation.
    expect(state.title).toBe('Title');
    expect(state.buttons).toHaveLength(1);
  });

  it('show after hide replaces the previous payload', () => {
    themedAlertStore.getState().show('First', 'Msg1', [{ text: 'A' }]);
    themedAlertStore.getState().hide();
    themedAlertStore.getState().show('Second', undefined, [{ text: 'B' }, { text: 'C' }]);

    const state = themedAlertStore.getState();
    expect(state.visible).toBe(true);
    expect(state.title).toBe('Second');
    expect(state.message).toBeUndefined();
    expect(state.buttons).toHaveLength(2);
  });
});
