import { createClient } from '@/lib/supabase/client';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;

interface LogClientErrorInput {
  message: string;
  stack?: string | null;
  userId?: string | null;
  branchId?: string | null;
}

// Free, self-hosted alternative to a third-party error tracker: logs real
// browser errors into our own client_errors table so an admin can see what
// actually broke for a user, without depending on an external vendor or its
// seat/event limits. Never throws — a failure here must not cascade into
// yet another uncaught error.
export async function logClientError(input: LogClientErrorInput): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from('client_errors').insert({
      message: input.message.slice(0, MAX_MESSAGE_LENGTH),
      stack: input.stack ? input.stack.slice(0, MAX_STACK_LENGTH) : null,
      url: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
      user_id: input.userId ?? null,
      branch_id: input.branchId ?? null,
    });
  } catch {
    // Swallow — logging the error must never itself become an error.
  }
}

interface ErrorLoggingContext {
  userId: string | null;
  branchId: string | null;
}

// Wires window-level 'error'/'unhandledrejection' listeners to logClientError,
// pulling the current user/branch via a getter (not a snapshot) so the log
// reflects who was active when the error actually fired. Returns a teardown
// function to remove the listeners.
export function setupGlobalErrorLogging(getContext: () => ErrorLoggingContext): () => void {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    const ctx = getContext();
    void logClientError({
      message: event.error instanceof Error ? event.error.message : event.message,
      stack: event.error instanceof Error ? event.error.stack ?? null : null,
      userId: ctx.userId,
      branchId: ctx.branchId,
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const ctx = getContext();
    const reason = event.reason;
    void logClientError({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack ?? null : null,
      userId: ctx.userId,
      branchId: ctx.branchId,
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
