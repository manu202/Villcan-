import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClosingWizard } from './ClosingWizard';

const BRANCH = { id: 'b1', name: 'Centro' };
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({ currentBranch: BRANCH }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: { mandatory_arqueo_enabled: false },
  }),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUserId: () => Promise.resolve('user-1'),
}));

const mockGetLastClosing = vi.fn();
const mockGetCalculatedBalanceSince = vi.fn();

vi.mock('@/lib/closings', () => ({
  getLastClosing: (...args: unknown[]) => mockGetLastClosing(...args),
  getCalculatedBalanceSince: (...args: unknown[]) => mockGetCalculatedBalanceSince(...args),
}));

vi.mock('@/lib/arqueo', () => ({
  buildClosingPayload: () => ({ branch_id: 'b1', total: 50000 }),
}));

const mockInsert = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: mockInsert }),
  }),
}));

vi.mock('@/lib/utils', () => ({
  formatGuaranies: (n: number) => `₲ ${n}`,
  parseGuaranies: (s: string) => parseInt(s || '0', 10),
  formatDate: (d: string) => d,
}));

vi.mock('./HoldButton', () => ({
  HoldButton: ({ label, onConfirm, disabled }: {
    label: string; onConfirm: () => void; disabled?: boolean;
  }) => (
    <button
      data-testid="hold-button"
      onClick={onConfirm}
      disabled={disabled}
    >
      {label}
    </button>
  ),
}));

const BALANCE = { efectivo: 10000, transferencia: 20000, pos: 20000 };

describe('ClosingWizard — paso 1 (resumen)', () => {
  beforeEach(() => {
    mockGetLastClosing.mockResolvedValue(null);
    mockGetCalculatedBalanceSince.mockResolvedValue(BALANCE);
    mockInsert.mockResolvedValue({ error: null });
  });

  it('muestra el balance calculado en el paso 1', async () => {
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/₲ 50000/)).toBeTruthy());
  });

  it('tiene un botón para avanzar al paso 2', async () => {
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => screen.getByText(/₲ 10000/));
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeTruthy();
  });

  it('avanza al paso 2 al presionar Siguiente', async () => {
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
  });
});

describe('ClosingWizard — paso 2 (sin arqueo requerido)', () => {
  beforeEach(() => {
    mockGetLastClosing.mockResolvedValue(null);
    mockGetCalculatedBalanceSince.mockResolvedValue(BALANCE);
  });

  it('sin arqueo obligatorio muestra mensaje y permite avanzar', async () => {
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeTruthy();
  });
});

describe('ClosingWizard — paso 3 (confirmación)', () => {
  beforeEach(() => {
    mockGetLastClosing.mockResolvedValue(null);
    mockGetCalculatedBalanceSince.mockResolvedValue(BALANCE);
    mockInsert.mockResolvedValue({ error: null });
  });

  it('muestra HoldButton para confirmar el cierre', async () => {
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(screen.getByTestId('hold-button')).toBeTruthy();
  });

  it('llama onSaved y onClose al confirmar', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ClosingWizard onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByTestId('hold-button'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('permite volver al paso anterior', async () => {
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByRole('button', { name: /volver/i }));
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
  });
});
