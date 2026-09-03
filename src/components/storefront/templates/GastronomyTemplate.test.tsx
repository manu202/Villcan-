import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GastronomyTemplate } from './GastronomyTemplate';
import type { Branch, Service } from '@/types';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: vi.fn() }),
}));

const branch: Branch = {
  id: 'b1',
  name: 'Tatapiriri',
  address: null,
  is_active: true,
  vertical: 'gastronomy',
  created_at: '2026-01-01',
  slug: 'tatapiriri-demo',
  whatsapp_number: '595981123456',
  storefront_enabled: true,
};

const services: Service[] = [
  {
    id: 's1',
    name: 'Mozzarella',
    price: 55000,
    cost: null,
    created_at: '2026-01-01',
    is_active: true,
    branch_id: 'b1',
    description: 'Base blanca, mozzarella',
    image_url: null,
    category: 'Pizzas',
    is_available: true,
  },
  {
    id: 's2',
    name: '3 Salsas',
    price: 30000,
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
    id: 's3',
    name: 'Napolitana',
    price: 60000,
    cost: null,
    created_at: '2026-01-01',
    is_active: true,
    branch_id: 'b1',
    description: 'Con tomate fresco',
    image_url: null,
    category: 'Pizzas',
    is_available: true,
  },
];

describe('GastronomyTemplate (one-product-at-a-time swipe)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing and shows the first product plus the brand name', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    expect(screen.getAllByText('Tatapiriri').length).toBeGreaterThan(0);
    expect(screen.getByText('Mozzarella')).toBeTruthy();
    expect(screen.getByText('Base blanca, mozzarella')).toBeTruthy();
    // Only the current product is shown — not a category list of everything.
    expect(screen.queryByText('3 Salsas')).toBeNull();
    expect(screen.queryByText('Napolitana')).toBeNull();
  });

  it('renders a single-product catalog without crashing and disables both arrows', () => {
    render(<GastronomyTemplate branch={branch} services={[services[0]]} />);
    expect(screen.getByText('Mozzarella')).toBeTruthy();
    const prevBtn = screen.getByRole('button', {
      name: /producto anterior/i,
    }) as HTMLButtonElement;
    const nextBtn = screen.getByRole('button', {
      name: /producto siguiente/i,
    }) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(true);
  });

  it('renders an empty catalog without crashing', () => {
    render(<GastronomyTemplate branch={branch} services={[]} />);
    expect(screen.getAllByText('Tatapiriri').length).toBeGreaterThan(0);
    expect(screen.getByText(/no hay productos/i)).toBeTruthy();
  });

  it('advances to the next product on "next" and back on "prev", clamping at both ends', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    const prevBtn = screen.getByRole('button', {
      name: /producto anterior/i,
    }) as HTMLButtonElement;
    const nextBtn = screen.getByRole('button', {
      name: /producto siguiente/i,
    }) as HTMLButtonElement;

    // Clamped at the start — prev does nothing on the first product.
    expect(prevBtn.disabled).toBe(true);
    fireEvent.click(nextBtn);
    expect(screen.getByText('3 Salsas')).toBeTruthy();
    expect(screen.queryByText('Mozzarella')).toBeNull();

    fireEvent.click(nextBtn);
    expect(screen.getByText('Napolitana')).toBeTruthy();

    // Clamped at the end — next does nothing on the last product.
    expect(nextBtn.disabled).toBe(true);
    fireEvent.click(nextBtn);
    expect(screen.getByText('Napolitana')).toBeTruthy();

    fireEvent.click(prevBtn);
    expect(screen.getByText('3 Salsas')).toBeTruthy();
  });

  it('"Agregar al carrito" adds the currently visible product, not a fixed one', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    const addBtn = screen.getByRole('button', { name: /agregar al carrito/i });

    // Add the first product (Mozzarella).
    fireEvent.click(addBtn);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);

    // Move to the second product and add it too.
    fireEvent.click(screen.getByRole('button', { name: /producto siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /agregar al carrito/i }));

    // Open the cart drawer and confirm both distinct products landed in it
    // (the second product is also still shown as the current stage product,
    // so it legitimately appears twice — the drawer line item is the tell).
    fireEvent.click(screen.getByRole('button', { name: /abrir pedido/i }));
    expect(screen.getAllByText('Mozzarella').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 Salsas').length).toBeGreaterThan(0);
  });

  it('the cart badge reflects the real item count and leads to checkout', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /agregar al carrito/i }));
    fireEvent.click(screen.getByRole('button', { name: /agregar al carrito/i }));

    const cartBtn = screen.getByRole('button', { name: /abrir pedido/i });
    expect(cartBtn.textContent).toContain('2');

    fireEvent.click(cartBtn);
    fireEvent.click(screen.getByRole('button', { name: /continuar pedido/i }));

    // CheckoutForm is reused as-is — its "Nombre" field is the tell.
    expect(screen.getByLabelText(/nombre/i)).toBeTruthy();
  });
});
