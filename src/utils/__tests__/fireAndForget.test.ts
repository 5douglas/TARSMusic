import { fireAndForget } from '../fireAndForget';

describe('fireAndForget', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not warn when the promise resolves', async () => {
    fireAndForget(Promise.resolve('ok'), 'test');
    // Allow microtasks to flush
    await Promise.resolve();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns with tag and Error message when the promise rejects', async () => {
    fireAndForget(Promise.reject(new Error('boom')), 'sync-scope');
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledWith('[fireAndForget:sync-scope]', 'boom');
  });

  it('warns with a stringified value when the rejection is non-Error', async () => {
    fireAndForget(Promise.reject('string-reason'), 'installer');
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledWith('[fireAndForget:installer]', 'string-reason');
  });

  it('never throws synchronously', () => {
    expect(() => fireAndForget(Promise.reject(new Error('x')), 'sync')).not.toThrow();
  });
});
