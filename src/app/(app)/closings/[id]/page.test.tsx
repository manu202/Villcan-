import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ClosingDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'closing-1' }),
}));

const mockGetCashClosingById = vi.fn();
vi.mock('@/lib/data/closings', () => ({
  getCashClosingById: (id: string) => mockGetCashClosingById(id),
}));

describe('ClosingDetailPage', () => {
  beforeEach(() => {
    mockGetCashClosingById.mockReset();
  });

  it('renders date, branch, closed_by, and the per-method breakdown for a real closing', async () => {
    mockGetCashClosingById.mockResolvedValue({
      data: {
        id: 'closing-1',
        closed_at: '2026-07-15T20:00:00.000Z',
        arqueo_enabled: true,
        calculated_efectivo: 100000,
        calculated_transferencia: 50000,
        calculated_pos: 20000,
        calculated_total: 170000,
        counted_efectivo: 105000,
        counted_transferencia: 50000,
        counted_pos: 18000,
        discrepancy_efectivo: 5000,
        discrepancy_transferencia: 0,
        discrepancy_pos: -2000,
        branch: { name: 'Centro' },
        closed_by_profile: { full_name: 'Juan Perez' },
      },
      error: null,
    });

    render(<ClosingDetailPage />);

    await waitFor(() => expect(screen.getByText('Centro')).toBeTruthy());
    expect(mockGetCashClosingById).toHaveBeenCalledWith('closing-1');
    expect(screen.getByText('Juan Perez')).toBeTruthy();
    expect(screen.getByText(/₲\s*100.000/)).toBeTruthy(); // calculated efectivo
    expect(screen.getByText(/₲\s*105.000/)).toBeTruthy(); // counted efectivo
    expect(screen.getByText(/\+₲\s*5.000/)).toBeTruthy(); // discrepancy efectivo
  });

  it('shows "Sin arqueo" and no counted/discrepancy columns for a toggle-OFF closing', async () => {
    mockGetCashClosingById.mockResolvedValue({
      data: {
        id: 'closing-2',
        closed_at: '2026-07-14T20:00:00.000Z',
        arqueo_enabled: false,
        calculated_efectivo: 30000,
        calculated_transferencia: 0,
        calculated_pos: 0,
        calculated_total: 30000,
        counted_efectivo: null,
        counted_transferencia: null,
        counted_pos: null,
        discrepancy_efectivo: null,
        discrepancy_transferencia: null,
        discrepancy_pos: null,
        branch: { name: 'Centro' },
        closed_by_profile: { full_name: 'Juan Perez' },
      },
      error: null,
    });

    render(<ClosingDetailPage />);

    await waitFor(() => expect(screen.getByText(/₲\s*30.000/)).toBeTruthy());
    expect(screen.getByText(/sin arqueo/i)).toBeTruthy();
  });

  it('shows "Cierre no encontrado" when the fetch errors', async () => {
    mockGetCashClosingById.mockResolvedValue({ data: null, error: { message: 'not found' } });

    render(<ClosingDetailPage />);

    await waitFor(() => expect(screen.getByText(/cierre no encontrado/i)).toBeTruthy());
  });

  it('shows "Cierre no encontrado" when the fetch returns no data and no error', async () => {
    mockGetCashClosingById.mockResolvedValue({ data: null, error: null });

    render(<ClosingDetailPage />);

    await waitFor(() => expect(screen.getByText(/cierre no encontrado/i)).toBeTruthy());
  });
});
