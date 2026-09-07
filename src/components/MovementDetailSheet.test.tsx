import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MovementDetailSheet } from './MovementDetailSheet';

vi.mock('@/lib/utils', () => ({
  formatGuaranies: (n: number) => `₲ ${n}`,
  formatDate: (_d: string) => '07/09/2026',
  formatTime: (_d: string) => '10:30',
  getMovementTypeLabel: (t: string) => ({
    servicio: 'Servicio', gasto: 'Gasto', apertura: 'Apertura', cierre: 'Retiro',
  })[t] ?? t,
  getPaymentMethodLabel: (m: string) => ({
    efectivo: 'Efectivo', transferencia: 'Transferencia', pos: 'POS',
  })[m] ?? m,
}));

vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({ currentBranch: { id: 'b1', user_role: 'admin' } }),
}));

const mockSingle = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSingle,
        }),
      }),
    }),
  }),
}));

const BASE_SERVICIO = {
  id: 'm1',
  type: 'servicio',
  amount_charged: 25000,
  commission_pct: null,
  income: 25000,
  expense: 0,
  payment_method: 'transferencia',
  contact_id: 'c1',
  service_id: 's1',
  user_id: 'u1',
  branch_id: 'b1',
  comment: null,
  created_at: '2026-09-07T10:30:00Z',
  contact: { id: 'c1', full_name: 'Juan Pérez' },
  service: { id: 's1', name: 'Lomo Completo' },
};

const BASE_GASTO = {
  id: 'm2',
  type: 'gasto',
  amount_charged: null,
  commission_pct: null,
  income: 0,
  expense: 5000,
  payment_method: null,
  contact_id: null,
  service_id: null,
  user_id: 'u1',
  branch_id: 'b1',
  comment: 'Materiales de limpieza',
  created_at: '2026-09-07T11:00:00Z',
  contact: null,
  service: null,
};

const BASE_APERTURA = {
  ...BASE_GASTO,
  id: 'm3',
  type: 'apertura',
  income: 50000,
  expense: 0,
  comment: null,
};

// ─── Loading ──────────────────────────────────────────────────────────────────

describe('MovementDetailSheet — loading', () => {
  it('muestra estado de carga mientras resuelve', () => {
    mockSingle.mockReturnValue(new Promise(() => {})); // never resolves
    render(<MovementDetailSheet movementId="m1" onClose={vi.fn()} />);
    expect(screen.getByTestId('mds-loading')).toBeTruthy();
  });
});

// ─── Servicio ─────────────────────────────────────────────────────────────────

describe('MovementDetailSheet — tipo servicio', () => {
  beforeEach(() => {
    mockSingle.mockResolvedValue({ data: BASE_SERVICIO, error: null });
  });

  it('muestra el nombre del cliente', async () => {
    render(<MovementDetailSheet movementId="m1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
  });

  it('muestra el nombre del servicio', async () => {
    render(<MovementDetailSheet movementId="m1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Lomo Completo')).toBeTruthy());
  });

  it('muestra el método de pago', async () => {
    render(<MovementDetailSheet movementId="m1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Transferencia')).toBeTruthy());
  });

  it('muestra el monto cobrado en la sección de servicio', async () => {
    render(<MovementDetailSheet movementId="m1" onClose={vi.fn()} />);
    await waitFor(() => {
      const serviceSection = screen.getByText('Lomo Completo').closest('.mds-info-row') as HTMLElement;
      expect(within(serviceSection).getByText('₲ 25000')).toBeTruthy();
    });
  });

  it('NO muestra sección de Vuelto para transferencia', async () => {
    render(<MovementDetailSheet movementId="m1" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('Lomo Completo'));
    expect(screen.queryByText('Vuelto')).toBeNull();
  });

  it('muestra sección de Vuelto para efectivo', async () => {
    mockSingle.mockResolvedValue({
      data: { ...BASE_SERVICIO, payment_method: 'efectivo', income: 20000, expense: 5000 },
      error: null,
    });
    render(<MovementDetailSheet movementId="m1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Vuelto')).toBeTruthy());
  });
});

// ─── Gasto ───────────────────────────────────────────────────────────────────

describe('MovementDetailSheet — tipo gasto', () => {
  beforeEach(() => {
    mockSingle.mockResolvedValue({ data: BASE_GASTO, error: null });
  });

  it('muestra la descripción (comment)', async () => {
    render(<MovementDetailSheet movementId="m2" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Materiales de limpieza')).toBeTruthy());
  });

  it('muestra el monto del gasto', async () => {
    render(<MovementDetailSheet movementId="m2" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('₲ 5000')).toBeTruthy());
  });
});

// ─── Apertura ────────────────────────────────────────────────────────────────

describe('MovementDetailSheet — tipo apertura', () => {
  it('muestra el monto de apertura', async () => {
    mockSingle.mockResolvedValue({ data: BASE_APERTURA, error: null });
    render(<MovementDetailSheet movementId="m3" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('₲ 50000')).toBeTruthy());
  });
});
