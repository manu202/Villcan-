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
];

describe('GastronomyTemplate (smoke)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing and groups services by category (with a fallback bucket)', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    expect(screen.getAllByText('Tatapiriri').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pizzas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Otros').length).toBeGreaterThan(0);
  });

  it('increments the cart count when adding an item', () => {
    render(<GastronomyTemplate branch={branch} services={services} />);
    fireEvent.click(screen.getAllByRole('button', { name: /agregar/i })[0]);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });
});
