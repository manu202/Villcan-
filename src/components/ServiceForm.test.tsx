import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ServiceForm } from './ServiceForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({ currentBranch: { id: 'branch-1', name: 'Centro' }, initialized: true }),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const insertMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      insert: (payload: unknown) => {
        insertMock(payload);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'svc-1', name: 'Test', price: 1000 }, error: null }),
          }),
        };
      },
    }),
  }),
}));

describe('ServiceForm product fields (description, image_url, category, is_available)', () => {
  beforeEach(() => {
    insertMock.mockClear();
  });

  it('sends description, image_url, category and is_available on submit', async () => {
    render(<ServiceForm />);

    fireEvent.change(screen.getByPlaceholderText('Corte clásico'), { target: { value: 'Corte' } });
    fireEvent.change(screen.getByPlaceholderText('35000'), { target: { value: '35000' } });
    fireEvent.change(screen.getByPlaceholderText('Se muestra en la tienda pública debajo del nombre'), {
      target: { value: 'Un corte prolijo' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://...'), {
      target: { value: 'https://example.com/img.png' },
    });
    fireEvent.change(screen.getByPlaceholderText('Cortes, Bebidas, etc.'), {
      target: { value: 'Cortes' },
    });

    fireEvent.click(screen.getByText('Guardar Servicio'));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Un corte prolijo',
        image_url: 'https://example.com/img.png',
        category: 'Cortes',
        is_available: true,
      })
    );
  });

  it('sends null for optional product fields when left blank', async () => {
    render(<ServiceForm />);

    fireEvent.change(screen.getByPlaceholderText('Corte clásico'), { target: { value: 'Corte' } });
    fireEvent.change(screen.getByPlaceholderText('35000'), { target: { value: '35000' } });

    fireEvent.click(screen.getByText('Guardar Servicio'));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
        image_url: null,
        category: null,
        is_available: true,
      })
    );
  });

  it('sends is_available: false when the Disponible toggle is switched off', async () => {
    render(<ServiceForm />);

    fireEvent.change(screen.getByPlaceholderText('Corte clásico'), { target: { value: 'Corte' } });
    fireEvent.change(screen.getByPlaceholderText('35000'), { target: { value: '35000' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Disponible en la tienda pública' }));

    fireEvent.click(screen.getByText('Guardar Servicio'));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_available: false })
    );
  });
});
