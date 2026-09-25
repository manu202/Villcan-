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

// ContactForm (the "+ Crear nuevo cliente" quick-create step) needs this.
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const mockRpc = vi.fn();
const services = [
  { id: 's1', name: 'Corte', price: 40000, cost: null, created_at: '2026-01-01', is_active: true, branch_id: 'branch-1', is_available: true },
];

// contacts search results, settable per test; empty by default (no matches).
let contactsSearchResult: Array<{ id: string; full_name: string; phone: string | null }> = [];
let contactInsertResult: { data: { id: string; full_name: string; phone: string } | null; error: unknown } = {
  data: null,
  error: null,
};
const lastInsertPayload: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'contacts') {
        return {
          select: () => ({
            or: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: contactsSearchResult, error: null }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            lastInsertPayload.push(payload);
            return {
              select: () => ({
                single: () => Promise.resolve(contactInsertResult),
              }),
            };
          },
        };
      }
      // services query (unrelated to contacts): select().eq().eq().or().order()
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              or: () => ({
                order: () => Promise.resolve({ data: services, error: null }),
              }),
            }),
          }),
        }),
      };
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

async function goToCustomerStep() {
  render(<NewManualOrderPage />);
  await waitFor(() => expect(screen.getByText('Corte')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
  fireEvent.click(screen.getByRole('button', { name: /continuar pedido/i }));
  await waitFor(() => expect(screen.getByLabelText(/buscar cliente/i)).toBeTruthy());
}

describe('NewManualOrderPage (REQ: staff-entered order, same catalog/pricing as storefront)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: { order_id: 'order-1' }, error: null });
    mockPush.mockReset();
    contactsSearchResult = [];
    contactInsertResult = { data: null, error: null };
    lastInsertPayload.length = 0;
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', user_role: 'admin' },
      initialized: true,
    });
  });

  // UX-1 (2026-09-25): /orders/new used to reuse the storefront's own plain
  // nombre/teléfono/email fields -- no contact search, no way to tell
  // whether an order was for an existing customer or a new one. Now it goes
  // through the same search + quick-create pattern as MovementForm's Venta
  // flow (PaymentStep.tsx) before reaching checkout, so a mistyped phone no
  // longer silently creates a duplicate contact.
  describe('customer step: search and select an existing contact', () => {
    it('shows matching contacts as the staffer types, and selecting one advances straight to checkout', async () => {
      await goToCustomerStep();

      contactsSearchResult = [{ id: 'c1', full_name: 'Ana Gómez', phone: '595981234567' }];
      fireEvent.change(screen.getByLabelText(/buscar cliente/i), { target: { value: 'Ana' } });

      await waitFor(() => expect(screen.getByText('Ana Gómez')).toBeTruthy());
      fireEvent.click(screen.getByText('Ana Gómez'));

      // Advanced to checkout: no raw nombre/teléfono inputs, contact shown instead.
      await waitFor(() => expect(screen.queryByLabelText(/^nombre/i)).toBeNull());
      expect(screen.getByText(/ana gómez/i)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /confirmar pedido/i }));

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith(
          'create_manual_order',
          expect.objectContaining({
            p_branch_id: 'branch-1',
            p_customer_name: 'Ana Gómez',
            p_customer_phone: '595981234567',
          })
        )
      );
    });

    it('does not advance and shows a message when the matched contact has no phone on file', async () => {
      await goToCustomerStep();

      contactsSearchResult = [{ id: 'c2', full_name: 'Sin Teléfono', phone: null }];
      fireEvent.change(screen.getByLabelText(/buscar cliente/i), { target: { value: 'Sin' } });

      await waitFor(() => expect(screen.getByText('Sin Teléfono')).toBeTruthy());
      fireEvent.click(screen.getByText('Sin Teléfono'));

      await waitFor(() =>
        expect(screen.getByText(/no tiene teléfono registrado/i)).toBeTruthy()
      );
      // Still on the customer step, not checkout.
      expect(screen.getByLabelText(/buscar cliente/i)).toBeTruthy();
    });
  });

  describe('customer step: quick-create a new contact', () => {
    it('creates the contact, then advances to checkout with it selected', async () => {
      await goToCustomerStep();

      fireEvent.click(screen.getByText(/crear nuevo cliente/i));

      contactInsertResult = {
        data: { id: 'c3', full_name: 'Nuevo Cliente', phone: '595985551234' },
        error: null,
      };
      fireEvent.change(screen.getByPlaceholderText('Nombre completo'), {
        target: { value: 'Nuevo Cliente' },
      });
      fireEvent.change(screen.getByPlaceholderText('595 984 123456'), {
        target: { value: '0985551234' },
      });
      fireEvent.click(screen.getByText('Guardar Contacto'));

      await waitFor(() => expect(screen.queryByLabelText(/^nombre/i)).toBeNull());
      expect(screen.getByText(/nuevo cliente/i)).toBeTruthy();
      expect(lastInsertPayload[0]).toMatchObject({ phone: '595985551234' });

      fireEvent.click(screen.getByRole('button', { name: /confirmar pedido/i }));

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith(
          'create_manual_order',
          expect.objectContaining({
            p_branch_id: 'branch-1',
            p_customer_name: 'Nuevo Cliente',
            p_customer_phone: '595985551234',
          })
        )
      );
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/orders/order-1'));
    });
  });

  it('calls create_manual_order and navigates to the new order on success', async () => {
    mockRpc.mockResolvedValue({ data: { order_id: 'order-1' }, error: null });
    await goToCustomerStep();

    contactsSearchResult = [{ id: 'c1', full_name: 'Ana Gómez', phone: '595981234567' }];
    fireEvent.change(screen.getByLabelText(/buscar cliente/i), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByText('Ana Gómez')).toBeTruthy());
    fireEvent.click(screen.getByText('Ana Gómez'));

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
