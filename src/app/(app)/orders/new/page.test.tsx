import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import NewManualOrderPage from './page';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockRpc = vi.fn();
const services = [
  { id: 's1', name: 'Corte', price: 40000, cost: null, created_at: '2026-01-01', is_active: true, branch_id: 'branch-1', is_available: true },
];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            or: () => ({
              order: () => Promise.resolve({ data: services, error: null }),
            }),
          }),
        }),
      }),
    }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

describe('NewManualOrderPage (REQ: staff-entered order, same catalog/pricing as storefront)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockPush.mockReset();
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', user_role: 'admin' },
      initialized: true,
    });
  });

  it('calls create_manual_order with p_branch_id (not p_slug) and navigates to the new order on success', async () => {
    mockRpc.mockResolvedValue({ data: { order_id: 'order-1' }, error: null });

    render(<NewManualOrderPage />);

    await waitFor(() => expect(screen.getByText('Corte')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar pedido/i }));

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '981123456' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pedido/i }));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith(
        'create_manual_order',
        expect.objectContaining({ p_branch_id: 'branch-1' })
      )
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/orders/order-1'));
  });
});
