jest.mock('../persistence/kvStorage', () => require('../persistence/__mocks__/kvStorage'));

let mockUuidCallCount = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    mockUuidCallCount++;
    return `00000000-0000-0000-0000-${String(mockUuidCallCount).padStart(12, '0')}`;
  }),
}));

let mockDeviceName: string | null = 'Greg\'s Pixel';
let mockModelName: string | null = 'Pixel 8 Pro';
jest.mock('expo-device', () => ({
  get deviceName() { return mockDeviceName; },
  get modelName() { return mockModelName; },
}));

jest.mock('../../i18n/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string, opts?: { model?: string }) => {
      if (key === 'deviceLabelDefault' && opts?.model) return `Your ${opts.model}`;
      if (key === 'deviceLabelDefaultFallback') return 'Your Substreamer device';
      return key;
    },
  },
}));

// Reset the mocked KV store between tests so persistence doesn't bleed across.
const kvStorageMock = require('../persistence/__mocks__/kvStorage');

beforeEach(() => {
  mockUuidCallCount = 0;
  mockDeviceName = "Greg's Pixel";
  mockModelName = 'Pixel 8 Pro';
  if (typeof kvStorageMock.kvStorage.clear === 'function') {
    kvStorageMock.kvStorage.clear();
  }
  // Re-import the module fresh so the persisted state from prior tests
  // doesn't carry over.
  jest.resetModules();
});

describe('deviceIdentityStore — initialization', () => {
  it('generates a deviceId on first import', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    expect(deviceIdentityStore.getState().deviceId).toMatch(/^[0-9a-f-]+$/);
  });

  it('captures Device.deviceName at init', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    expect(deviceIdentityStore.getState().deviceName).toBe("Greg's Pixel");
  });

  it('derives default deviceLabel from Device.modelName', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    expect(deviceIdentityStore.getState().deviceLabel).toBe('Your Pixel 8 Pro');
  });

  it('falls back to "Your Substreamer device" when modelName is null', () => {
    mockModelName = null;
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    expect(deviceIdentityStore.getState().deviceLabel).toBe('Your Substreamer device');
  });

  it('starts with deviceLabelUserSet=false', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    expect(deviceIdentityStore.getState().deviceLabelUserSet).toBe(false);
  });
});

describe('deviceIdentityStore — setDeviceLabel', () => {
  it('updates the label and flips deviceLabelUserSet', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    deviceIdentityStore.getState().setDeviceLabel('My Custom Name');
    expect(deviceIdentityStore.getState().deviceLabel).toBe('My Custom Name');
    expect(deviceIdentityStore.getState().deviceLabelUserSet).toBe(true);
  });

  it('trims whitespace from the input', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    deviceIdentityStore.getState().setDeviceLabel('  Padded  ');
    expect(deviceIdentityStore.getState().deviceLabel).toBe('Padded');
  });

  it('ignores empty / whitespace-only input', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    const before = deviceIdentityStore.getState().deviceLabel;
    deviceIdentityStore.getState().setDeviceLabel('');
    deviceIdentityStore.getState().setDeviceLabel('   ');
    expect(deviceIdentityStore.getState().deviceLabel).toBe(before);
    expect(deviceIdentityStore.getState().deviceLabelUserSet).toBe(false);
  });
});

describe('deviceIdentityStore — refreshDeviceName', () => {
  it('picks up an OS-side device name change', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    expect(deviceIdentityStore.getState().deviceName).toBe("Greg's Pixel");
    mockDeviceName = "Greg's New Pixel";
    deviceIdentityStore.getState().refreshDeviceName();
    expect(deviceIdentityStore.getState().deviceName).toBe("Greg's New Pixel");
  });

  it('handles Device.deviceName becoming null', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    mockDeviceName = null;
    deviceIdentityStore.getState().refreshDeviceName();
    expect(deviceIdentityStore.getState().deviceName).toBeNull();
  });
});

describe('deviceIdentityStore — ensureDefaultLabel', () => {
  it('updates the auto-default if model name changed and user has not set a custom label', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    expect(deviceIdentityStore.getState().deviceLabel).toBe('Your Pixel 8 Pro');
    mockModelName = 'Pixel 9';
    deviceIdentityStore.getState().ensureDefaultLabel();
    expect(deviceIdentityStore.getState().deviceLabel).toBe('Your Pixel 9');
  });

  it('does NOT overwrite a user-set label', () => {
    const { deviceIdentityStore } = require('../deviceIdentityStore');
    deviceIdentityStore.getState().setDeviceLabel('Greg Custom');
    mockModelName = 'Pixel 9';
    deviceIdentityStore.getState().ensureDefaultLabel();
    expect(deviceIdentityStore.getState().deviceLabel).toBe('Greg Custom');
  });
});

describe('getDeviceShortId', () => {
  it('returns the first 8 hex chars of the deviceId without dashes', () => {
    const { getDeviceShortId, deviceIdentityStore } = require('../deviceIdentityStore');
    deviceIdentityStore.setState({
      deviceId: '12345678-aaaa-bbbb-cccc-deadbeef0000',
      deviceName: null,
      deviceLabel: 'x',
      deviceLabelUserSet: false,
    });
    expect(getDeviceShortId()).toBe('12345678');
  });

  it('handles deviceIds with dashes correctly (slice of stripped hex)', () => {
    const { getDeviceShortId, deviceIdentityStore } = require('../deviceIdentityStore');
    deviceIdentityStore.setState({
      deviceId: '1-2-3-4-5',
      deviceName: null,
      deviceLabel: 'x',
      deviceLabelUserSet: false,
    });
    expect(getDeviceShortId()).toBe('12345');
  });
});
