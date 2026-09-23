import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ServiceEditSheet } from './ServiceEditSheet';

const mockCurrentBranch = { id: 'branch-abc', name: 'Villcan Centro', role: 'admin' };

vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({ currentBranch: mockCurrentBranch }),
}));

let serviceData: {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  description: string | null;
  image_url: string | null;
  category: string | null;
  is_available: boolean;
  branch_id: string | null;
};

const mockUpdate = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: serviceData, error: null }),
        }),
      }),
      update: (payload: unknown) => {
        mockUpdate(payload);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

describe('ServiceEditSheet — parity with the full edit page (Catálogo standard)', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    serviceData = {
      id: 'svc-1',
      name: 'Corte',
      price: 50000,
      cost: 20000,
      description: '',
      image_url: '',
      category: '',
      is_available: true,
      branch_id: 'branch-abc',
    };
  });

  it('renders a Global toggle and submits branch_id: null when it is turned on', async () => {
    render(<ServiceEditSheet serviceId="svc-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText('Global (todas las sucursales)'));

    fireEvent.click(screen.getByLabelText('Servicio global (todas las sucursales)'));
    fireEvent.click(screen.getByText('Guardar cambios'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const payload = mockUpdate.mock.calls[0][0] as { branch_id: string | null };
    expect(payload.branch_id).toBeNull();
  });

  it('renders an image URL field and submits the typed value as image_url', async () => {
    render(<ServiceEditSheet serviceId="svc-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByLabelText('Imagen'));

    fireEvent.change(screen.getByPlaceholderText('https://...'), {
      target: { value: 'https://example.com/foto.jpg' },
    });
    fireEvent.click(screen.getByText('Guardar cambios'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const payload = mockUpdate.mock.calls[0][0] as { image_url: string | null };
    expect(payload.image_url).toBe('https://example.com/foto.jpg');
  });
});
