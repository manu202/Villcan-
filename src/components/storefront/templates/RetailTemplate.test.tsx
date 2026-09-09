import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RetailTemplate } from './RetailTemplate';
import type { Branch, Service } from '@/types';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: vi.fn() }),
}));

const branch: Branch = {
  id: 'b2',
  name: 'Retail Demo',
  address: null,
  is_active: true,
  vertical: 'retail',
  created_at: '2026-01-01',
  slug: 'retail-demo',
  whatsapp_number: '595981123456',
  storefront_enabled: true,
};

const services: Service[] = [
  {
    id: 's1',
    name: 'Remera básica',
    price: 80000,
    cost: null,
    created_at: '2026-01-01',
    is_active: true,
    branch_id: 'b2',
    description: null,
    image_url: null,
    category: 'Ropa',
    is_available: true,
  },
];

describe('RetailTemplate (smoke)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing and shows an image fallback when image_url is null', () => {
    render(<RetailTemplate branch={branch} services={services} />);
    expect(screen.getByText('Retail Demo')).toBeTruthy();
    expect(screen.getByText('Remera básica')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('increments the cart badge when adding a product', () => {
    render(<RetailTemplate branch={branch} services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  // Regression: the checkout used to `return` early on
  // step === 'delivery-data' | 'payment', unmounting the whole product grid
  // behind it — same bug fixed in GastronomyTemplate (see its
  // "keeps the catalog mounted underneath the delivery step" test).
  it('keeps the catalog mounted underneath the delivery step', () => {
    render(<RetailTemplate branch={branch} services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    fireEvent.click(screen.getByRole('button', { name: /ver carrito/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delivery$/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar compra/i }));

    // Delivery step is showing…
    expect(screen.getByPlaceholderText(/Mcal\. López/i)).toBeTruthy();
    // …and the product grid behind it never unmounted.
    expect(screen.getByText('Remera básica')).toBeTruthy();
  });
});
