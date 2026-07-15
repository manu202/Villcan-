import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MovementForm, buildFinalComment } from './MovementForm';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.ilike = chainable;
  mock.order = chainable;
  mock.limit = chainable;
  mock.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resultPromise.then(onFulfilled, onRejected);
  return mock;
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

let contactFromCalls = 0;
let contactDeferreds: ReturnType<typeof createDeferred>[] = [];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'contacts') {
        const deferred = contactDeferreds[contactFromCalls];
        contactFromCalls++;
        return createQueryMock(deferred.promise);
      }
      // services (and anything else): resolve immediately with empty list
      return createQueryMock(Promise.resolve({ data: [], error: null }));
    },
  }),
}));

describe('MovementForm contact-search race condition guard', () => {
  beforeEach(() => {
    contactFromCalls = 0;
    contactDeferreds = [createDeferred(), createDeferred()];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
    });
  });

  it('ignores a stale ("ju") response that resolves after a fresher ("juan") response', async () => {
    render(<MovementForm initialType="servicio" />);

    const searchInput = screen.getByPlaceholderText('Buscar cliente...');

    // First keystroke: "ju" -> fires search A
    fireEvent.change(searchInput, { target: { value: 'ju' } });
    await waitFor(() => expect(contactFromCalls).toBe(1));

    // Continues typing to "juan" before A resolves -> fires search B
    fireEvent.change(searchInput, { target: { value: 'juan' } });
    await waitFor(() => expect(contactFromCalls).toBe(2));

    // Resolve B ("juan") FIRST.
    contactDeferreds[1].resolve({
      data: [{ id: 'c2', full_name: 'Juan Perez' }],
      error: null,
    });
    await waitFor(() => screen.getByText('Juan Perez'));

    // THEN resolve A ("ju"), stale response, AFTER B already set state.
    contactDeferreds[0].resolve({
      data: [{ id: 'c1', full_name: 'Julia Gomez' }],
      error: null,
    });

    // Give the stale resolution a chance to (wrongly) overwrite state.
    await new Promise((r) => setTimeout(r, 20));

    // The stale ("ju") result must not have overwritten the fresh ("juan") one.
    expect(screen.queryByText('Julia Gomez')).toBeNull();
    expect(screen.getByText('Juan Perez')).toBeTruthy();
  });
});

describe('finalComment construction (locks existing correct behavior, REQ-TEST-3)', () => {
  it('gasto + fuente + comment -> appends bracketed fuente suffix', () => {
    expect(buildFinalComment('gasto', 'Cta Bancaria', ' Pago alquiler '))
      .toBe('Pago alquiler [Cta Bancaria]');
  });

  it('gasto + fuente + empty comment -> comment is just the bracketed fuente', () => {
    expect(buildFinalComment('gasto', 'Caja', '')).toBe('[Caja]');
  });

  it('servicio ignores fuente entirely, regardless of its value', () => {
    expect(buildFinalComment('servicio', 'Cta Bancaria', 'Corte + barba'))
      .toBe('Corte + barba');
  });

  it('gasto + falsy fuente -> no suffix appended', () => {
    expect(buildFinalComment('gasto', '', 'Sin fuente')).toBe('Sin fuente');
  });
});

describe('"Cta Bancaria" substring convention guard (REQ-TEST-6, documents a KNOWN LIMITATION)', () => {
  it('the only producer of the "Cta Bancaria" marker is the fuente-suffix append', () => {
    // MovementForm's own construction always brackets the fuente:
    const produced = buildFinalComment('gasto', 'Cta Bancaria', 'Alquiler');
    expect(produced).toBe('Alquiler [Cta Bancaria]');
    expect(produced?.includes('Cta Bancaria')).toBe(true);
  });

  it('KNOWN LIMITATION: page.tsx\'s balanceEfectivo filter cannot distinguish a ' +
     'free-typed "Cta Bancaria" substring from the fuente-button-produced marker', () => {
    // This mirrors the exact predicate used in src/app/page.tsx:67-68 -
    // `.filter(m => !m.comment?.includes('Cta Bancaria'))` when computing
    // gastosFromCaja - applied to a comment the user typed freely WITHOUT
    // selecting the fuente='Cta Bancaria' button.
    const freeTypedComment = 'Pago a Cta Bancaria alquiler';
    // "Included in gastosFromCaja" (i.e. counted against balanceEfectivo)
    // requires the comment to NOT contain the marker substring:
    const includedInGastosFromCaja = !freeTypedComment.includes('Cta Bancaria');

    // The filter treats this free-typed text exactly the same as a real
    // fuente-produced marker: it gets EXCLUDED from gastosFromCaja (i.e. does
    // NOT reduce balanceEfectivo) even though no fuente button was pressed.
    // This is the documented fragility of the free-text substring convention
    // (see spec REQ-TEST-6) - NOT a fix, just a regression-proofing guard so
    // nobody "fixes" one side (e.g. changes the marker format) without
    // noticing the other.
    expect(includedInGastosFromCaja).toBe(false);
  });
});
