import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', card: '#111', border: '#333' },
  }),
}));
const mockAlert = jest.fn();
jest.mock('../../../hooks/useThemedAlert', () => ({ useThemedAlert: () => ({ alert: mockAlert }) }));
jest.mock('../RestoreBackupSheet', () => ({ RestoreBackupSheet: () => null }));
jest.mock('../../../services/backupService', () => ({
  createBackup: jest.fn(async () => 'stem-1'),
  pruneBackups: jest.fn(async () => undefined),
  makeBackupIdentityKey: (url: string, user: string) => `${url}|${user}`,
}));
jest.mock('../../../services/serverBackupService', () => ({
  restoreFromServerIfNewer: jest.fn(async () => null),
  uploadBackupToServer: jest.fn(async () => true),
}));
jest.mock('../../../services/subsonicService', () => ({
  SERVER_BACKUP_PLAYLIST_NAME: 'TARSMusic backup (não apagar)',
}));
jest.mock('../../../store/persistence/kvStorage', () =>
  require('../../../store/persistence/__mocks__/kvStorage'),
);

import { BackupRestoreCard } from '../BackupRestoreCard';
import { restoreFromServerIfNewer, uploadBackupToServer } from '../../../services/serverBackupService';
import { authStore } from '../../../store/authStore';
import { backupStore } from '../../../store/backupStore';

beforeEach(() => {
  mockAlert.mockClear();
  authStore.setState({ serverUrl: 'https://music.example.com', primaryServerUrl: null, username: 'dino' } as any);
  backupStore.setState({
    serverSyncedAt: { 'https://music.example.com|dino': '2026-11-01T00:00:00.000Z' },
  } as any);
});

describe('BackupRestoreCard', () => {
  it('describes the server backup and where it lives', () => {
    render(<BackupRestoreCard />);
    expect(screen.getByText('Backup on your server')).toBeTruthy();
    expect(screen.getByText('music.example.com')).toBeTruthy();
    expect(screen.getByText(/TARSMusic backup \(não apagar\)/)).toBeTruthy();
    expect(screen.queryByText(/Google Backup/)).toBeNull();
  });

  it('Back Up Now merges, backs up and uploads, then confirms', async () => {
    render(<BackupRestoreCard />);
    await act(async () => { fireEvent.press(screen.getByText('Back Up Now')); });
    expect(restoreFromServerIfNewer).toHaveBeenCalled();
    expect(uploadBackupToServer).toHaveBeenCalledWith('stem-1');
    expect(mockAlert).toHaveBeenCalledWith('Backed up', expect.any(String));
  });

  it('Restore forces a merge from the server', async () => {
    render(<BackupRestoreCard />);
    await act(async () => { fireEvent.press(screen.getByText('Restore')); });
    expect(restoreFromServerIfNewer).toHaveBeenCalledWith(true);
    expect(mockAlert).toHaveBeenCalledWith('Nothing to restore', expect.any(String));
  });
});
