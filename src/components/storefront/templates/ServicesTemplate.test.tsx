import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServicesTemplate } from './ServicesTemplate';
import type { Branch, Service } from '@/types';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: vi.fn() }),
}));

const branch: Branch = {
  id: 'b3',
  name: 'Barbería Demo',
  address: null,
  is_active: true,
  vertical: 'barbershop',
  created_at: '2026-01-01',
  slug: 'barberia-demo',
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
    branch_id: null,
    description: 'Corte a tijera y máquina',
    image_url: null,
    category: null,
    is_available: true,
  },
];

describe('ServicesTemplate (smoke)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing', () => {
    render(<ServicesTemplate branch={branch} services={services} />);
    expect(screen.getByText('Barbería Demo')).toBeTruthy();
    expect(screen.getByText('Corte clásico')).toBeTruthy();
  });

  it('increments the selection count when adding a service', () => {
    render(<ServicesTemplate branch={branch} services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    expect(screen.getByText(/ver selección \(1\)/i)).toBeTruthy();
  });
});
