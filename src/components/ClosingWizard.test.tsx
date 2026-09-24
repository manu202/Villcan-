import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClosingWizard } from './ClosingWizard';

const BRANCH = { id: 'b1', name: 'Centro' };
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({ currentBranch: BRANCH }),
}));

const settingsState = vi.hoisted(() => ({ mandatory_arqueo_enabled: false }));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: settingsState,
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
// Defaults to 0 so existing tests (which don't care about S-5) don't need to
// mock this explicitly; only the dedicated S-5 test overrides it.
const mockGetPendingOrdersCount = vi.fn(() => Promise.resolve(0));

vi.mock('@/lib/closings', () => ({
  getLastClosing: (...args: unknown[]) => mockGetLastClosing(...args),
  getCalculatedBalanceSince: (...args: unknown[]) => mockGetCalculatedBalanceSince(...args),
  getPendingOrdersCount: (...args: unknown[]) => mockGetPendingOrdersCount(...args),
}));

const mockBuildClosingPayload = vi.fn(() => ({ branch_id: 'b1', total: 50000 }));
vi.mock('@/lib/arqueo', () => ({
  buildClosingPayload: (...args: unknown[]) => mockBuildClosingPayload(...args),
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

  // S-5: closing a period never warned about orders still in flight --
  // their eventual movements land in whatever period they complete in.
  it('muestra un aviso cuando hay pedidos pendientes sin completar', async () => {
    mockGetPendingOrdersCount.mockResolvedValueOnce(3);
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/3 pedidos pendientes/i)).toBeTruthy());
  });

  it('no muestra ningún aviso cuando no hay pedidos pendientes', async () => {
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => screen.getByText(/₲ 10000/));
    expect(screen.queryByText(/pendiente/i)).toBeNull();
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

describe('ClosingWizard — paso 3 (arqueo obligatorio: discrepancias y notas)', () => {
  beforeEach(() => {
    settingsState.mandatory_arqueo_enabled = true;
    mockGetLastClosing.mockResolvedValue(null);
    mockGetCalculatedBalanceSince.mockResolvedValue(BALANCE);
    mockInsert.mockResolvedValue({ error: null });
    mockBuildClosingPayload.mockClear();
  });

  afterEach(() => {
    settingsState.mandatory_arqueo_enabled = false;
  });

  const goToStep3 = async (efectivoDigits: string) => {
    render(<ClosingWizard onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    fireEvent.change(screen.getByLabelText(/efectivo contado/i), { target: { value: efectivoDigits } });
    fireEvent.change(screen.getByLabelText(/transferencia contada/i), { target: { value: String(BALANCE.transferencia) } });
    fireEvent.change(screen.getByLabelText(/pos contado/i), { target: { value: String(BALANCE.pos) } });

    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
  };

  it('un superávit de efectivo se muestra en verde (wz-surplus), no en rojo de alarma', async () => {
    await goToStep3(String(BALANCE.efectivo + 5000));

    const efectivoRow = screen.getByText('Efectivo').closest('.wz-balance-row') as HTMLElement;
    const discSpan = efectivoRow.querySelector('span:last-child') as HTMLElement;
    expect(discSpan.className).toBe('wz-surplus');
    expect(discSpan.className).not.toBe('wz-mismatch');
  });

  it('un faltante de efectivo se muestra en rojo (wz-shortage)', async () => {
    await goToStep3(String(BALANCE.efectivo - 5000));

    const efectivoRow = screen.getByText('Efectivo').closest('.wz-balance-row') as HTMLElement;
    const discSpan = efectivoRow.querySelector('span:last-child') as HTMLElement;
    expect(discSpan.className).toBe('wz-shortage');
    expect(discSpan.className).not.toBe('wz-mismatch');
  });

  it('permite ingresar notas y las incluye en el payload de cierre', async () => {
    await goToStep3(String(BALANCE.efectivo));

    fireEvent.change(screen.getByLabelText(/notas/i), { target: { value: '  Vuelto mal entregado  ' } });
    fireEvent.click(screen.getByTestId('hold-button'));

    await waitFor(() => expect(mockBuildClosingPayload).toHaveBeenCalled());
    const payloadArg = mockBuildClosingPayload.mock.calls[0][0] as { notes?: string | null };
    expect(payloadArg.notes).toBe('Vuelto mal entregado');
  });

  it('sin notas ingresadas, envía notes null en el payload', async () => {
    await goToStep3(String(BALANCE.efectivo));

    fireEvent.click(screen.getByTestId('hold-button'));

    await waitFor(() => expect(mockBuildClosingPayload).toHaveBeenCalled());
    const payloadArg = mockBuildClosingPayload.mock.calls[0][0] as { notes?: string | null };
    expect(payloadArg.notes).toBeNull();
  });
});
