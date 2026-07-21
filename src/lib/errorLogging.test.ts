import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logClientError, setupGlobalErrorLogging } from './errorLogging';

const mockInsert = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => mockInsert(table, row),
    }),
  }),
}));

describe('logClientError', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('inserts a row into client_errors with the given message/stack/context', async () => {
    await logClientError({ message: 'Boom', stack: 'at foo.js:1', userId: 'u1', branchId: 'b1' });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const [table, row] = mockInsert.mock.calls[0];
    expect(table).toBe('client_errors');
    expect(row).toMatchObject({
      message: 'Boom',
      stack: 'at foo.js:1',
      user_id: 'u1',
      branch_id: 'b1',
    });
  });

  it('never throws even if the insert itself fails', async () => {
    mockInsert.mockRejectedValue(new Error('network down'));
    await expect(logClientError({ message: 'x' })).resolves.toBeUndefined();
  });

  it('truncates an overly long message/stack so a single row cannot balloon', async () => {
    const longMessage = 'a'.repeat(5000);
    await logClientError({ message: longMessage });
    const row = mockInsert.mock.calls[0][1] as { message: string };
    expect(row.message.length).toBeLessThanOrEqual(2000);
  });
});

// Deliberately does NOT use window.dispatchEvent(new ErrorEvent(...)) — jsdom/
// Vitest treats a real dispatched 'error' event as an actual uncaught
// exception in the test run (fails the suite even though it's synthetic).
// Instead, spy on addEventListener to capture the exact callback
// setupGlobalErrorLogging registers, and invoke it directly with a fake
// event object — this exercises the same code path without tripping
// Vitest's own uncaught-exception detection.
describe('setupGlobalErrorLogging', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ error: null });
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  function getRegisteredHandler(spy: typeof addSpy, type: string) {
    const call = spy.mock.calls.find((c: unknown[]) => c[0] === type);
    return call?.[1] as (event: unknown) => void;
  }

  it('logs a client_errors row when the registered error handler fires, using the current context', () => {
    const getContext = () => ({ userId: 'u2', branchId: 'b2' });
    setupGlobalErrorLogging(getContext);

    const onError = getRegisteredHandler(addSpy, 'error');
    expect(onError).toBeTypeOf('function');
    onError({ message: 'Something broke', error: new Error('Something broke') });

    expect(mockInsert).toHaveBeenCalled();
    const row = mockInsert.mock.calls[0][1] as { user_id: string; branch_id: string };
    expect(row.user_id).toBe('u2');
    expect(row.branch_id).toBe('b2');
  });

  it('removes both listeners when the returned teardown function is called', () => {
    const getContext = () => ({ userId: null, branchId: null });
    const teardown = setupGlobalErrorLogging(getContext);
    const onError = getRegisteredHandler(addSpy, 'error');

    teardown();

    expect(removeSpy).toHaveBeenCalledWith('error', onError);
    expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  });
});
