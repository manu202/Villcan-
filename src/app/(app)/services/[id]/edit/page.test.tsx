import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ServiceEditPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'svc-1' }),
  useRouter: () => ({ push: vi.fn() }),
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
};

const updateMock = vi.fn();

function createSelectQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.single = () => resultPromise;
  return mock;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => createSelectQueryMock(Promise.resolve({ data: serviceData, error: null })),
      update: (payload: unknown) => {
        updateMock(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
}));

describe('ServiceEditPage product fields (description, image_url, category, is_available)', () => {
  beforeEach(() => {
    updateMock.mockClear();
    serviceData = {
      id: 'svc-1',
      name: 'Corte',
      price: 50000,
      cost: 20000,
      description: 'Descripción existente',
      image_url: 'https://example.com/old.png',
      category: 'Cortes',
      is_available: true,
    };
  });

  it('prefills the new fields from the fetched service', async () => {
    render(<ServiceEditPage />);

    await waitFor(() => expect(screen.getByDisplayValue('Corte')).toBeTruthy());

    expect(screen.getByDisplayValue('Descripción existente')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.com/old.png')).toBeTruthy();
    expect(screen.getByDisplayValue('Cortes')).toBeTruthy();
  });

  it('sends the edited fields (including is_available) on submit', async () => {
    render(<ServiceEditPage />);

    await waitFor(() => expect(screen.getByDisplayValue('Corte')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Nueva descripción' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Disponible en la tienda pública' }));

    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Nueva descripción',
        image_url: 'https://example.com/old.png',
        category: 'Cortes',
        is_available: false,
      })
    );
  });
});
