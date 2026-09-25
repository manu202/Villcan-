import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReportsPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}));

// Movement rows per type, settable per test. `servicio` covers BOTH the
// main period query and the prevPeriod comparison query — the component
// issues the main `servicio` query first, then (later) the prevPeriod one,
// so the Nth call of a given type gets the Nth entry of that type's array
// here (falls back to an empty result once exhausted).
type MovementsByType = Record<string, unknown[][]>;
let movementsByType: MovementsByType = {};
let callCountByType: Record<string, number> = {};

// QA-3 (2026-09-22): the Servicios breakdown used to read movements.service
// (via movements.service_id), but every order-derived 'servicio' movement
// has service_id NULL — an order can have several services, so the
// order-completion trigger never sets a single one (see
// 20260922020000_atomic_order_payment_completion.sql). The real source for
// "what was actually sold" is order_items. This bucket lets tests supply
// that data on the `order_items` table independently of `movements`.
let orderItemsData: unknown[] = [];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'order_items') {
        const builder: Record<string, unknown> = {};
        const chainable = () => builder;
        builder.select = chainable;
        builder.eq = chainable;
        builder.gte = chainable;
        builder.lt = chainable;
        builder.in = chainable;
        builder.then = (onFulfilled: (v: unknown) => unknown) =>
          Promise.resolve({ data: orderItemsData, error: null }).then(onFulfilled);
        return builder;
      }
      // `type` is set via the first `.eq('type', X)` call the component
      // makes on this builder — every query on this page filters by type
      // before anything else, so we can build the mock lazily per builder.
      const builder: Record<string, unknown> = {};
      let resolvedType: string | null = null;
      const chainable = () => builder;
      builder.select = chainable;
      builder.eq = (field: string, value: unknown) => {
        if (field === 'type') resolvedType = value as string;
        return builder;
      };
      builder.gte = chainable;
      builder.lt = chainable;
      builder.then = (onFulfilled: (v: unknown) => unknown) => {
        const type = resolvedType || 'servicio';
        const callsSoFar = callCountByType[type] || 0;
        const dataForType = movementsByType[type] || [];
        const data = dataForType[callsSoFar] ?? [];
        callCountByType[type] = callsSoFar + 1;
        return Promise.resolve({ data, error: null }).then(onFulfilled);
      };
      return builder;
    },
  }),
}));

describe('ReportsPage balanceNeto computation (uses the shared computeCashBalance, M-3)', () => {
  beforeEach(() => {
    callCountByType = {};
    orderItemsData = [];
    movementsByType = {
      // main servicio query (1st call) = 100000 efectivo; prevPeriod query
      // (2nd call of type servicio) = empty
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }],
        [],
      ],
      gasto: [[{ expense: 30000, income: 0, comment: 'Alquiler' }]],
      apertura: [[]],
      cierre: [[]],
    };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Servicios' } });
  });

  it('computes balanceNeto = global cash balance (100000 - 30000 = 70000) when there is no apertura/cierre/bank-split', async () => {
    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('₲ 70.000')).toBeTruthy();
  });

  it('M-3 regression: apertura, cierre and a bank-tagged gasto change the correct answer away from the old serviciosAmount - gastosTotal formula', async () => {
    // Old (wrong) formula would have shown: serviciosAmount(100000) -
    // gastosTotal(30000 + 20000 bank-tagged) = 50000 — ignoring apertura and
    // cierre entirely. The correct answer, per computeCashBalance:
    //   efectivo = apertura(200000) + servicioEfectivo(100000)
    //              - cashGasto(30000) - cierre(50000) = 220000
    //   global   = efectivo(220000) + transferencia(0) + pos(0)
    //              - bankGasto(20000) = 200000
    movementsByType = {
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }],
        [],
      ],
      gasto: [[
        { expense: 30000, income: 0, comment: 'Insumos' },
        { expense: 20000, income: 0, comment: 'Alquiler [Cta Bancaria]' },
      ]],
      apertura: [[{ income: 200000 }]],
      cierre: [[{ expense: 50000 }]],
    };

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 200.000'));

    expect(screen.getByText('₲ 200.000')).toBeTruthy();
    // the old, wrong 50000 must NOT be what's displayed
    expect(screen.queryByText('₲ 50.000')).toBeNull();
  });
});

describe('ReportsPage Servicios breakdown reads order_items, not movements.service_id (QA-3)', () => {
  beforeEach(() => {
    callCountByType = {};
    orderItemsData = [];
    // service_id is NULL on every order-derived movement (see comment
    // above the mock) — no `service` field here, matching real production
    // data, unlike the other describe blocks' legacy `service: { name }`
    // mock shape.
    movementsByType = {
      servicio: [
        [{ amount_charged: 105000, income: 105000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', order_id: 'order-1', service: null }],
        [],
      ],
      gasto: [[]],
      apertura: [[]],
      cierre: [[]],
    };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Servicios' } });
  });

  it('groups by order_items.name_snapshot instead of falling back to "Sin servicio"', async () => {
    orderItemsData = [
      { name_snapshot: 'Barba', line_total: 30000, qty: 1 },
      { name_snapshot: 'Corte clásico', line_total: 75000, qty: 2 },
    ];

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('Barba'));

    expect(screen.getByText('Barba')).toBeTruthy();
    expect(screen.getByText('Corte clásico')).toBeTruthy();
    expect(screen.queryByText('Sin servicio')).toBeNull();
  });
});

describe('ReportsPage liquidación link uses configurable staff_label (generalize-verticals)', () => {
  beforeEach(() => {
    callCountByType = {};
    orderItemsData = [];
    movementsByType = {
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }],
        [],
      ],
      gasto: [[{ expense: 30000, income: 0, comment: 'Alquiler' }]],
      apertura: [[]],
      cierre: [[]],
    };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
  });

  it('shows the configured staff_label in the liquidación link instead of hardcoded "barbero"', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Mozo' } });

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('Liquidación por mozo ›')).toBeTruthy();
  });

  it('shows a different configured staff_label without hardcoding "Mozo" either', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Operador' } });

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('Liquidación por operador ›')).toBeTruthy();
  });
});

describe('ReportsPage KPI/card labels use configurable services_label instead of hardcoded "Servicios"', () => {
  beforeEach(() => {
    callCountByType = {};
    orderItemsData = [];
    movementsByType = {
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }],
        [],
      ],
      gasto: [[{ expense: 30000, income: 0, comment: 'Alquiler' }]],
      apertura: [[]],
      cierre: [[]],
    };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
  });

  it('uses services_label in the "Total {label}" KPI and the breakdown card title', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Menú' } });

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('Total Menú')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Menú' })).toBeTruthy();
    expect(screen.queryByText('Total Servicios')).toBeNull();
  });

  it('falls back to the default label "Servicios" when settings say so', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Servicios' } });

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('Total Servicios')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Servicios' })).toBeTruthy();
  });
});

describe('ReportsPage M-8: drill-down links and CSV export', () => {
  beforeEach(() => {
    callCountByType = {};
    orderItemsData = [
      { name_snapshot: 'Corte', line_total: 100000, qty: 1 },
    ];
    movementsByType = {
      // Extra slots (3rd servicio, 2nd gasto) cover the "switch to
      // Personalizar" test, which triggers a second main fetch (no
      // prevPeriod compare for a custom range).
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', order_id: 'order-1', service: null }],
        [],
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', order_id: 'order-1', service: null }],
      ],
      gasto: [
        [{ expense: 30000, income: 0, comment: 'Alquiler' }],
        [{ expense: 30000, income: 0, comment: 'Alquiler' }],
      ],
      apertura: [[], []],
      cierre: [[], []],
    };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Servicios' } });
  });

  it('the default view (Hoy) renders drill-down links for Servicios and Por Método rows', async () => {
    render(<ReportsPage />);

    await waitFor(() => screen.getByText('Corte'));

    const serviceLink = screen.getByText('Corte').closest('a');
    expect(serviceLink?.getAttribute('href')).toBe('/orders?range=today');

    const methodLink = screen.getByText('efectivo').closest('a');
    expect(methodLink?.getAttribute('href')).toBe('/movements?range=today&method=efectivo');
  });

  it('does not offer a drill-down link when the view is "Personalizar" (custom)', async () => {
    render(<ReportsPage />);
    await waitFor(() => screen.getByText('Corte'));

    fireEvent.click(screen.getByText('Personalizar'));
    fireEvent.change(screen.getByPlaceholderText('Desde'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByPlaceholderText('Hasta'), { target: { value: '2026-01-31' } });

    await waitFor(() => screen.getByText('Corte'));
    expect(screen.getByText('Corte').closest('a')).toBeNull();
    expect(screen.getByText('efectivo').closest('a')).toBeNull();
  });

  it('a method with no real payment_method ("sin método") never renders as a link', async () => {
    movementsByType = {
      ...movementsByType,
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: null, created_at: new Date().toISOString(), branch_id: 'branch-1', order_id: 'order-1', service: null }],
        [],
      ],
    };
    render(<ReportsPage />);

    await waitFor(() => screen.getByText('sin método'));
    expect(screen.getByText('sin método').closest('a')).toBeNull();
  });

  it('"Exportar CSV" triggers a CSV download with the current period\'s breakdown data', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ReportsPage />);
    await waitFor(() => screen.getByText('Exportar CSV'));

    fireEvent.click(screen.getByText('Exportar CSV'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg.type).toContain('text/csv');
    const csvText = await blobArg.text();
    expect(csvText).toContain('Corte');
    expect(csvText).toContain('efectivo');
    expect(csvText).toContain('Alquiler');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('the export button is hidden while loading', async () => {
    render(<ReportsPage />);
    expect(screen.queryByText('Exportar CSV')).toBeNull();
    await waitFor(() => screen.getByText('Exportar CSV'));
  });
});

describe('ReportsPage K3: Balance Neto uses a real green/red alarm signal, not ink-tone-only', () => {
  beforeEach(() => {
    callCountByType = {};
    orderItemsData = [];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Servicios' } });
  });

  it('a positive Balance Neto renders with the same green as a positive movement row', async () => {
    movementsByType = {
      servicio: [[{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }], []],
      gasto: [[]],
      apertura: [[]],
      cierre: [[]],
    };
    const { container } = render(<ReportsPage />);

    await waitFor(() => expect(container.querySelector('.kpi-tile-value')).toBeTruthy());
    const value = container.querySelector('.kpi-tile-value.income');
    expect(value).toBeTruthy();
    expect(value?.className).not.toContain('expense');
  });

  it('a negative Balance Neto renders with the same red as a negative movement row', async () => {
    movementsByType = {
      servicio: [[], []],
      gasto: [[{ expense: 50000, income: 0, comment: 'Alquiler' }]],
      apertura: [[]],
      cierre: [[]],
    };
    const { container } = render(<ReportsPage />);

    await waitFor(() => expect(container.querySelector('.kpi-tile-value')).toBeTruthy());
    const value = container.querySelector('.kpi-tile-value.expense');
    expect(value).toBeTruthy();
    expect(value?.className).not.toContain('income');
  });
});
