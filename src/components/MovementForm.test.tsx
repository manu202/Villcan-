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
  mock.or = chainable;
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

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}));
// Default: commissions off, matches today's out-of-the-box behavior. Tests
// that need commissions on override this locally via mockUseSettings.mockReturnValue(...).
mockUseSettings.mockReturnValue({ settings: { commissions_enabled: false, default_commission_pct: 0 } });

let contactFromCalls = 0;
let contactDeferreds: ReturnType<typeof createDeferred>[] = [];
let servicesData: unknown[] = [];
let lastMovementInsert: Record<string, unknown> | null = null;
let lastMovementItemsInsert: unknown = null;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'contacts') {
        const deferred = contactDeferreds[contactFromCalls];
        contactFromCalls++;
        return createQueryMock(deferred.promise);
      }
      if (table === 'services') {
        return createQueryMock(Promise.resolve({ data: servicesData, error: null }));
      }
      if (table === 'movements') {
        return {
          insert: (payload: Record<string, unknown>) => {
            lastMovementInsert = payload;
            // Support both:
            //   await insert()              → { error: null }
            //   await insert().select('id').single() → { data: { id: 'mvt-1' }, error: null }
            const resolved = { data: { id: 'mvt-1' }, error: null };
            return {
              select: (_cols: string) => ({
                single: () => Promise.resolve(resolved),
              }),
              then: (fn: (v: unknown) => unknown) =>
                Promise.resolve({ error: null }).then(fn),
            };
          },
        };
      }
      if (table === 'movement_items') {
        return {
          insert: (payload: unknown) => {
            lastMovementItemsInsert = payload;
            return Promise.resolve({ error: null });
          },
        };
      }
      // anything else: resolve immediately with empty list
      return createQueryMock(Promise.resolve({ data: [], error: null }));
    },
  }),
}));

async function navigateToCatalogPaymentStep() {
  // Wait for services to load and click "Agregar" to add to cart
  await waitFor(() => screen.getByText('Agregar'));
  fireEvent.click(screen.getByText('Agregar'));
  // CartSheet appears with the continue button
  await waitFor(() => screen.getByText('Continuar con el pago →'));
  fireEvent.click(screen.getByText('Continuar con el pago →'));
  // Now on payment step: contact search + payment method visible
  await waitFor(() => screen.getByPlaceholderText('Buscar cliente...'));
}

describe('MovementForm contact-search race condition guard', () => {
  beforeEach(() => {
    contactFromCalls = 0;
    contactDeferreds = [createDeferred(), createDeferred()];
    servicesData = [{ id: 'svc-1', name: 'Corte', price: 100000 }];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
    });
  });

  it('ignores a stale ("ju") response that resolves after a fresher ("juan") response', async () => {
    render(<MovementForm initialType="servicio" />);

    // Navigate catalog → payment step where contact search lives
    await navigateToCatalogPaymentStep();

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

describe('MovementForm dirty-guard on back-tap (REQ-DIRTY-1)', () => {
  beforeEach(() => {
    contactFromCalls = 0;
    contactDeferreds = [createDeferred(), createDeferred()];
    servicesData = [{ id: 'svc-1', name: 'Corte', price: 100000 }];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
    });
  });

  it('clean catalog back-tap (empty cart) changes step silently (no ConfirmModal)', async () => {
    render(<MovementForm initialType="servicio" />);

    // We're on the catalog step (no items in cart = not dirty).
    await waitFor(() => screen.getByText('Nueva Venta'));
    fireEvent.click(screen.getByText('←'));

    // No confirm dialog, navigated back to type selection.
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByText('Seleccionar tipo')).toBeTruthy());
  });

  it('dirty catalog (item in cart) back-tap shows ConfirmModal', async () => {
    render(<MovementForm initialType="servicio" />);

    // Add an item to cart (now dirty).
    await waitFor(() => screen.getByText('Agregar'));
    fireEvent.click(screen.getByText('Agregar'));

    fireEvent.click(screen.getByText('←'));

    // Modal shown, still on catalog step.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Nueva Venta')).toBeTruthy();

    // Confirm discard -> back to type step.
    fireEvent.click(screen.getByText('Descartar'));
    await waitFor(() => expect(screen.getByText('Seleccionar tipo')).toBeTruthy());
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

describe('cierre step regression guard (caja-integrity change must NOT touch this, REQ-CAJA-1/2)', () => {
  beforeEach(() => {
    contactFromCalls = 0;
    contactDeferreds = [createDeferred(), createDeferred()];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
    });
  });

  it('renders the same bare-amount "Monto" step for cierre as before caja-integrity, with no arqueo/count inputs', async () => {
    render(<MovementForm initialType="cierre" />);

    // Still just a single amount field with the extraction hint - no
    // per-payment-method count inputs, no discrepancy UI of any kind.
    expect(screen.getByText('Retiro de Caja')).toBeTruthy();
    expect(screen.getByText('Dinero a extraer/depositar')).toBeTruthy();
    expect(screen.getByPlaceholderText('0')).toBeTruthy();
    expect(screen.queryByLabelText(/efectivo/i)).toBeNull();
    expect(screen.queryByText(/discrepanc/i)).toBeNull();
    expect(screen.getByText('Registrar retiro')).toBeTruthy();
  });

  it('clicking submit without an amount shows an inline validation error for bare-amount types', () => {
    render(<MovementForm initialType="cierre" />);

    // No amount entered — inline errors should be absent initially.
    expect(screen.queryByText(/ingresá el monto/i)).toBeNull();

    fireEvent.click(screen.getByText('Registrar retiro'));

    // After attempted submit, inline error appears.
    expect(screen.getByText(/ingresá el monto/i)).toBeTruthy();

    // Entering an amount and resubmitting should clear the error path.
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '50000' } });
    expect(screen.queryByText(/ingresá el monto/i)).toBeNull();
  });
});

describe('commission_pct frozen at insert, servicio branch only (REQ-PROFIT-1/2)', () => {
  beforeEach(() => {
    contactFromCalls = 0;
    contactDeferreds = [createDeferred(), createDeferred()];
    servicesData = [{ id: 'svc-1', name: 'Corte', price: 100000 }];
    lastMovementInsert = null;
    lastMovementItemsInsert = null;
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
    });
  });

  async function fillAndSubmitServicio() {
    render(<MovementForm initialType="servicio" />);

    // Step 1: catalog — add service to cart
    await navigateToCatalogPaymentStep();

    // Step 2: payment — optional contact + payment method
    const searchInput = screen.getByPlaceholderText('Buscar cliente...');
    fireEvent.change(searchInput, { target: { value: 'juan' } });
    await waitFor(() => expect(contactFromCalls).toBe(1));
    contactDeferreds[0].resolve({
      data: [{ id: 'c1', full_name: 'Juan Perez' }],
      error: null,
    });
    await waitFor(() => screen.getByText('Juan Perez'));
    fireEvent.click(screen.getByText('Juan Perez'));

    fireEvent.click(screen.getByText('Transferencia'));

    fireEvent.click(screen.getByText('Registrar venta'));

    await waitFor(() => expect(lastMovementInsert).not.toBeNull());
  }

  it('commissions disabled -> commission_pct is null/undefined on the inserted movement', async () => {
    mockUseSettings.mockReturnValue({
      settings: { commissions_enabled: false, default_commission_pct: 15 },
    });

    await fillAndSubmitServicio();

    expect(lastMovementInsert?.commission_pct ?? null).toBeNull();
  });

  it('commissions enabled -> commission_pct = business_settings.default_commission_pct', async () => {
    mockUseSettings.mockReturnValue({
      settings: { commissions_enabled: true, default_commission_pct: 12.5 },
    });

    await fillAndSubmitServicio();

    expect(lastMovementInsert?.commission_pct).toBe(12.5);
  });
});

// ─── movement_items para ventas multi-servicio (REQ-FIN-3) ────────────────────

describe('MovementForm — multi-servicio inserta movement_items (REQ-FIN-3)', () => {
  beforeEach(() => {
    contactFromCalls = 0;
    contactDeferreds = [createDeferred(), createDeferred()];
    lastMovementInsert = null;
    lastMovementItemsInsert = null;
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
    });
    mockUseSettings.mockReturnValue({
      settings: { commissions_enabled: false, default_commission_pct: 0 },
    });
  });

  async function submitServicioWith(serviceList: unknown[]) {
    servicesData = serviceList;
    render(<MovementForm initialType="servicio" />);
    await waitFor(() => expect(screen.getAllByText('Agregar').length).toBeGreaterThan(0));
    screen.getAllByText('Agregar').forEach((btn) => fireEvent.click(btn));
    await waitFor(() => screen.getByText('Continuar con el pago →'));
    fireEvent.click(screen.getByText('Continuar con el pago →'));
    await waitFor(() => screen.getByText('Transferencia'));
    fireEvent.click(screen.getByText('Transferencia'));
    fireEvent.click(screen.getByText('Registrar venta'));
    await waitFor(() => expect(lastMovementInsert).not.toBeNull());
  }

  it('single-service: NO inserta en movement_items', async () => {
    await submitServicioWith([{ id: 'svc-1', name: 'Corte', price: 30000 }]);
    expect(lastMovementItemsInsert).toBeNull();
  });

  it('multi-service: inserta movement_items con name_snapshot, qty, unit_price, line_total', async () => {
    await submitServicioWith([
      { id: 'svc-1', name: 'Corte', price: 30000 },
      { id: 'svc-2', name: 'Barba', price: 15000 },
    ]);
    expect(lastMovementItemsInsert).not.toBeNull();
    const items = lastMovementItemsInsert as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name_snapshot: 'Corte', qty: 1, unit_price: 30000, line_total: 30000 });
    expect(items[1]).toMatchObject({ name_snapshot: 'Barba', qty: 1, unit_price: 15000, line_total: 15000 });
  });
});
