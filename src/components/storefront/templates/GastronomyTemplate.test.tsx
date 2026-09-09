import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

describe('GastronomyTemplate — ticket-grid catalog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all products visible in the catalog at once (grid, not carousel)', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    // All products must be visible simultaneously — this is the grid, not one-at-a-time.
    expect(screen.getByText('Mozzarella')).toBeTruthy();
    expect(screen.getByText('3 Salsas')).toBeTruthy();
    expect(screen.getByText('Napolitana')).toBeTruthy();
  });

  it('shows the branch name in the nav', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    expect(screen.getAllByText('Tatapiriri').length).toBeGreaterThan(0);
  });

  it('groups products under their category headings', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    expect(screen.getByRole('heading', { name: 'Pizzas' })).toBeTruthy();
    // Products with no category fall under the default heading
    expect(screen.getByRole('heading', { name: 'Del menú' })).toBeTruthy();
  });

  it('renders an empty catalog without crashing', () => {
    render(<GastronomyTemplate branch={branch} services={[]} />);
    expect(screen.getAllByText('Tatapiriri').length).toBeGreaterThan(0);
    expect(screen.getByText(/no hay productos/i)).toBeTruthy();
  });

  it('opens the product detail sheet when tapping a product', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    // Tap the first product ticket
    fireEvent.click(screen.getByRole('button', { name: /Mozzarella/i }));
    // Sheet should now show the product name (heading) and description.
    // Scoped to the dialog: the catalog row behind it renders the same name
    // and description text, and text queries (unlike role queries) don't
    // filter by aria-hidden.
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Mozzarella' })).toBeTruthy();
    expect(within(sheet).getByText('Base blanca, mozzarella')).toBeTruthy();
  });

  it('adds a product to the cart from the bottom sheet CTA', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Mozzarella/i }));
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    // Sheet closes and cart badge appears in the nav with count 1
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('opens the cart drawer from the nav cart button and shows line items', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    // Add Mozzarella
    fireEvent.click(screen.getByRole('button', { name: /Mozzarella/i }));
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    // The product sheet is a real vaul dialog now — while it's open it
    // correctly aria-hides the rest of the page (including the nav), so it
    // has to be closed explicitly before the nav's cart button is reachable.
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    const nav = screen.getByRole('navigation');
    fireEvent.click(within(nav).getByRole('button', { name: /ver pedido/i }));
    expect(screen.getByRole('heading', { name: 'Tu pedido' })).toBeTruthy();
    expect(screen.getAllByText('Mozzarella').length).toBeGreaterThan(0);
  });

  it('proceeds to checkout from the cart drawer', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Mozzarella/i }));
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    // Sheet CTA reads "Ver pedido · <total>" once qty > 0 — clicking it
    // closes the sheet and opens the cart drawer directly.
    fireEvent.click(screen.getByRole('button', { name: /ver pedido/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar pedido/i }));
    // CheckoutForm mounts — its Nombre field is the tell
    expect(screen.getByLabelText(/nombre/i)).toBeTruthy();
  });

  // REQ-CART-NAV-1 regression: the checkout used to `return` early on
  // step === 'delivery-data' | 'payment', unmounting the whole catalog —
  // killing scroll position and the category IntersectionObserver. The
  // catalog must stay mounted underneath the checkout sheet.
  it('keeps the catalog mounted underneath the checkout step', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Mozzarella/i }));
    fireEvent.click(screen.getByRole('button', { name: /agregar al pedido/i }));
    // Sheet's own CTA closes it and opens the cart drawer in one tap.
    fireEvent.click(screen.getByRole('button', { name: /ver pedido/i }));
    // "Continuar pedido" goes straight to the one combined checkout form —
    // pickup/delivery is picked inside it now, not on a screen before it.
    fireEvent.click(screen.getByRole('button', { name: /continuar pedido/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delivery$/i }));

    // The address field (only shown once Delivery is picked) is showing…
    expect(screen.getByPlaceholderText(/Mcal\. López/i)).toBeTruthy();
    // …and the catalog behind it never unmounted. "Napolitana" was never
    // opened in the product sheet, so its only possible source here is the
    // still-mounted catalog row.
    expect(screen.getByText('Napolitana')).toBeTruthy();
  });
});
