import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStorefrontCart } from './useStorefrontCart';
import type { Branch, Service } from '@/types';

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

const branch: Branch = {
  id: 'b1',
  name: 'Villcan Centro',
  address: null,
  is_active: true,
  vertical: 'barbershop',
  created_at: '2026-01-01',
  slug: 'villcan-centro',
  whatsapp_number: '595981123456',
  storefront_enabled: true,
};

const services: Service[] = [
  {
    id: 's1',
    name: 'Corte clásico',
    price: 40000,
    cost: null,
    created_at: '2026-01-01',
    is_active: true,
    branch_id: 'b1',
    description: null,
    image_url: null,
    category: null,
    is_available: true,
  },
  {
    id: 's2',
    name: 'Barba',
    price: 20000,
    cost: null,
    created_at: '2026-01-01',
    is_active: true,
    branch_id: 'b1',
    description: null,
    image_url: null,
    category: null,
    is_available: true,
  },
];

const checkoutValues = {
  name: 'Juan Pérez',
  phone: '0981123456',
  email: '',
  note: '',
  paymentMethod: 'efectivo' as const,
  deliveryType: 'pickup' as const,
  deliveryAddress: '',
};

describe('useStorefrontCart (REQ: shared cart/checkout logic across templates)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('adds items to the cart and computes lines/total/itemCount', () => {
    const { result } = renderHook(() => useStorefrontCart(branch, services));

    act(() => result.current.addToCart(services[0]));
    act(() => result.current.addToCart(services[0]));
    act(() => result.current.addToCart(services[1]));

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.itemCount).toBe(3);
    expect(result.current.total).toBe(40000 * 2 + 20000);
  });

  it('increments and decrements quantities, removing the line at zero', () => {
    const { result } = renderHook(() => useStorefrontCart(branch, services));

    act(() => result.current.addToCart(services[0]));
    act(() => result.current.increment(services[0].id));
    expect(result.current.cart[services[0].id]).toBe(2);

    act(() => result.current.decrement(services[0].id));
    act(() => result.current.decrement(services[0].id));
    expect(result.current.cart[services[0].id]).toBeUndefined();
    expect(result.current.lines).toHaveLength(0);
  });

  it('moves between catalog/checkout steps', () => {
    const { result } = renderHook(() => useStorefrontCart(branch, services));

    expect(result.current.step).toBe('catalog');
    act(() => result.current.goToCheckout());
    expect(result.current.step).toBe('checkout');
    act(() => result.current.backToCatalog());
    expect(result.current.step).toBe('catalog');
  });

  it('calls create_storefront_order with all parameters built from cart + form values', async () => {
    mockRpc.mockResolvedValue({
      data: {
        order_id: 'o1',
        order_code: 'A1B2C3',
        total: 40000,
        whatsapp_number: '595981123456',
        whatsapp_message: 'Pedido #A1B2C3',
        items: [],
      },
      error: null,
    });

    const { result } = renderHook(() => useStorefrontCart(branch, services));
    act(() => result.current.addToCart(services[0]));

    await act(async () => {
      await result.current.handleSubmit(checkoutValues);
    });

    expect(mockRpc).toHaveBeenCalledWith('create_storefront_order', {
      p_slug: 'villcan-centro',
      p_customer_name: 'Juan Pérez',
      p_customer_phone: '0981123456',
      p_customer_email: null,
      p_note: null,
      p_items: [{ service_id: 's1', qty: 1 }],
      p_payment_method: 'efectivo',
      p_delivery_type: 'pickup',
      p_delivery_address: null,
    });
  });

  it('sends the delivery address only when delivery type is delivery', async () => {
    mockRpc.mockResolvedValue({
      data: {
        order_id: 'o1',
        order_code: 'A1B2C3',
        total: 40000,
        whatsapp_number: '595981123456',
        whatsapp_message: 'Pedido #A1B2C3',
        items: [],
      },
      error: null,
    });

    const { result } = renderHook(() => useStorefrontCart(branch, services));
    act(() => result.current.addToCart(services[0]));

    await act(async () => {
      await result.current.handleSubmit({
        ...checkoutValues,
        deliveryType: 'delivery',
        deliveryAddress: 'Calle 123',
      });
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'create_storefront_order',
      expect.objectContaining({ p_delivery_type: 'delivery', p_delivery_address: 'Calle 123' })
    );
  });

  it('on success, transitions to the success step and builds the WhatsApp link', async () => {
    mockRpc.mockResolvedValue({
      data: {
        order_id: 'o1',
        order_code: 'A1B2C3',
        total: 40000,
        whatsapp_number: '595981123456',
        whatsapp_message: 'Pedido #A1B2C3',
        items: [],
      },
      error: null,
    });

    const { result } = renderHook(() => useStorefrontCart(branch, services));
    act(() => result.current.addToCart(services[0]));

    await act(async () => {
      await result.current.handleSubmit(checkoutValues);
    });

    expect(result.current.step).toBe('success');
    expect(result.current.result?.order_code).toBe('A1B2C3');
    expect(result.current.whatsappHref).toBe(
      'https://wa.me/595981123456?text=' + encodeURIComponent('Pedido #A1B2C3')
    );
  });

  it.each([
    ['VC400', /revis[aá] los datos/i],
    ['VC404', /tienda no disponible/i],
    ['VC409', /ya no está disponible/i],
    ['VC429', /demasiados pedidos/i],
  ])('maps error code %s to user-facing copy and never sets a result', async (code, matcher) => {
    mockRpc.mockResolvedValue({ data: null, error: { code, message: 'boom' } });

    const { result } = renderHook(() => useStorefrontCart(branch, services));
    act(() => result.current.addToCart(services[0]));

    await act(async () => {
      await result.current.handleSubmit(checkoutValues);
    });

    expect(result.current.errorMessage).toMatch(matcher);
    expect(result.current.step).toBe('catalog');
    expect(result.current.result).toBeNull();
    expect(result.current.whatsappHref).toBeNull();
  });

  it('falls back to a generic error message for unknown error codes', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'WEIRD', message: 'boom' } });

    const { result } = renderHook(() => useStorefrontCart(branch, services));
    act(() => result.current.addToCart(services[0]));

    await act(async () => {
      await result.current.handleSubmit(checkoutValues);
    });

    expect(result.current.errorMessage).toMatch(/ocurrió un error/i);
  });

  it('sets submitting true during the RPC call and false after', async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    mockRpc.mockReturnValue(
      new Promise((resolve) => {
        resolveRpc = resolve;
      })
    );

    const { result } = renderHook(() => useStorefrontCart(branch, services));
    act(() => result.current.addToCart(services[0]));

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.handleSubmit(checkoutValues);
    });

    await waitFor(() => expect(result.current.submitting).toBe(true));

    await act(async () => {
      resolveRpc({
        data: {
          order_id: 'o1',
          order_code: 'A1',
          total: 1,
          whatsapp_number: '595981123456',
          whatsapp_message: 'x',
          items: [],
        },
        error: null,
      });
      await submitPromise;
    });

    expect(result.current.submitting).toBe(false);
  });
});
