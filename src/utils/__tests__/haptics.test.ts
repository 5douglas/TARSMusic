import * as Haptics from 'expo-haptics';

import { impactAsync, notificationAsync, selectionAsync, ImpactFeedbackStyle } from '../haptics';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

const mockImpact = Haptics.impactAsync as jest.Mock;
const mockNotification = Haptics.notificationAsync as jest.Mock;
const mockSelection = Haptics.selectionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('impactAsync', () => {
  it('calls Haptics.impactAsync with default Medium style', async () => {
    await impactAsync();
    expect(mockImpact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('calls Haptics.impactAsync with specified style', async () => {
    await impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    expect(mockImpact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
  });

  it('silently catches when haptics unavailable', async () => {
    mockImpact.mockRejectedValueOnce(new Error('Haptics not available'));
    await expect(impactAsync()).resolves.toBeUndefined();
  });
});

describe('notificationAsync', () => {
  it('calls Haptics.notificationAsync with default Success type', async () => {
    await notificationAsync();
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('calls Haptics.notificationAsync with specified type', async () => {
    await notificationAsync(Haptics.NotificationFeedbackType.Error);
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('silently catches when haptics unavailable', async () => {
    mockNotification.mockRejectedValueOnce(new Error('Haptics not available'));
    await expect(notificationAsync()).resolves.toBeUndefined();
  });
});

describe('selectionAsync', () => {
  it('calls Haptics.selectionAsync', async () => {
    await selectionAsync();
    expect(mockSelection).toHaveBeenCalled();
  });

  it('silently catches when haptics unavailable', async () => {
    mockSelection.mockRejectedValueOnce(new Error('Haptics not available'));
    await expect(selectionAsync()).resolves.toBeUndefined();
  });
});

describe('ImpactFeedbackStyle re-export', () => {
  it('re-exports ImpactFeedbackStyle from expo-haptics', () => {
    expect(ImpactFeedbackStyle).toBe(Haptics.ImpactFeedbackStyle);
  });
});
