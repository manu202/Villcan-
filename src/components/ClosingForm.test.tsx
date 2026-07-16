import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClosingForm } from './ClosingForm';

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

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
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

const mockInsert = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe('ClosingForm', () => {
  beforeEach(() => {
    mockShowToast.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockGetLastClosing.mockReset();
    mockGetCalculatedBalanceSince.mockReset();

    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', user_role: 'admin' },
    });

    mockGetLastClosing.mockResolvedValue(null);
    mockGetCalculatedBalanceSince.mockResolvedValue({
      efectivo: 100000,
      transferencia: 50000,
      pos: 20000,
    });

    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  describe('toggle OFF (mandatory_arqueo_enabled=false) — REQ-CAJA-3', () => {
    beforeEach(() => {
      mockUseSettings.mockReturnValue({
        settings: { mandatory_arqueo_enabled: false },
      });
    });

    it('renders the calculated total and a single one-tap close button, no count inputs', async () => {
      render(<ClosingForm />);

      await waitFor(() => expect(screen.getByText(/₲\s*170.000/)).toBeTruthy());
      expect(screen.queryByLabelText(/efectivo contado/i)).toBeNull();
      expect(screen.getByRole('button', { name: 'Cerrar Caja' })).toBeTruthy();
    });

    it('one-tap close inserts a calculated-only snapshot (counted/discrepancy all null)', async () => {
      render(<ClosingForm />);

      await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar Caja' })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));

      await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('cash_closings'));
      const payload = mockInsert.mock.calls[0][0];
      expect(payload.arqueo_enabled).toBe(false);
      expect(payload.counted_efectivo).toBeNull();
      expect(payload.counted_transferencia).toBeNull();
      expect(payload.counted_pos).toBeNull();
      expect(payload.discrepancy_efectivo).toBeNull();
      expect(payload.calculated_total).toBe(170000);
      expect(payload.branch_id).toBe('branch-1');
      expect(payload.closed_by).toBe('user-1');

      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });
  });

  describe('toggle ON (mandatory_arqueo_enabled=true) — REQ-CAJA-4', () => {
    beforeEach(() => {
      mockUseSettings.mockReturnValue({
        settings: { mandatory_arqueo_enabled: true },
      });
    });

    it('requires a physical count per payment method and shows live discrepancy', async () => {
      render(<ClosingForm />);

      await waitFor(() => expect(screen.getByLabelText(/efectivo contado/i)).toBeTruthy());

      const submitBtn = screen.getByRole('button', { name: 'Cerrar Caja' }) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);

      fireEvent.change(screen.getByLabelText(/efectivo contado/i), { target: { value: '105000' } });
      fireEvent.change(screen.getByLabelText(/transferencia contada/i), { target: { value: '50000' } });
      fireEvent.change(screen.getByLabelText(/pos contado/i), { target: { value: '20000' } });

      expect(submitBtn.disabled).toBe(false);
      // Live discrepancy for efectivo = 105000 - 100000 = 5000 surplus
      expect(screen.getByText(/\+₲\s*5.000/)).toBeTruthy();
    });

    it('submitting saves counted amounts and computed discrepancy per method', async () => {
      render(<ClosingForm />);

      await waitFor(() => expect(screen.getByLabelText(/efectivo contado/i)).toBeTruthy());

      fireEvent.change(screen.getByLabelText(/efectivo contado/i), { target: { value: '105000' } });
      fireEvent.change(screen.getByLabelText(/transferencia contada/i), { target: { value: '50000' } });
      fireEvent.change(screen.getByLabelText(/pos contado/i), { target: { value: '18000' } });

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));

      await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('cash_closings'));
      const payload = mockInsert.mock.calls[0][0];
      expect(payload.arqueo_enabled).toBe(true);
      expect(payload.counted_efectivo).toBe(105000);
      expect(payload.discrepancy_efectivo).toBe(5000);
      expect(payload.discrepancy_transferencia).toBe(0);
      expect(payload.discrepancy_pos).toBe(-2000);
    });
  });
});
