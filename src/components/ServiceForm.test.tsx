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
const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
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
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  }),
}));

describe('ServiceForm name field placeholder (vertical-neutral text)', () => {
  it('does not use the barbershop-specific "Corte clásico" placeholder', () => {
    render(<ServiceForm />);

    expect(screen.queryByPlaceholderText('Corte clásico')).toBeNull();
    expect(screen.getByPlaceholderText('Nombre')).toBeTruthy();
  });
});

describe('ServiceForm product fields (description, image_url, category, is_available)', () => {
  beforeEach(() => {
    insertMock.mockClear();
    uploadMock.mockReset();
    getPublicUrlMock.mockReset();
  });

  it('sends description, image_url, category and is_available on submit', async () => {
    render(<ServiceForm />);

    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Corte' } });
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

    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Corte' } });
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

    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Corte' } });
    fireEvent.change(screen.getByPlaceholderText('35000'), { target: { value: '35000' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Disponible en la tienda pública' }));

    fireEvent.click(screen.getByText('Guardar Servicio'));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_available: false })
    );
  });

  it('uploads a selected image file and sends the resulting public URL as image_url', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'some-path.png' }, error: null });
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: 'https://cdn.example.com/service-images/some-path.png' },
    });

    render(<ServiceForm />);

    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Corte' } });
    fireEvent.change(screen.getByPlaceholderText('35000'), { target: { value: '35000' } });

    const file = new File(['fake-image-bytes'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir imagen'), { target: { files: [file] } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    const [path, uploadedFile] = uploadMock.mock.calls[0];
    expect(typeof path).toBe('string');
    expect(path).toContain('foto.png');
    expect(uploadedFile).toBe(file);

    expect(getPublicUrlMock).toHaveBeenCalledWith(path);

    fireEvent.click(screen.getByText('Guardar Servicio'));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        image_url: 'https://cdn.example.com/service-images/some-path.png',
      })
    );
  });

  it('shows an error and does not set image_url when the upload fails', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'Storage error' } });

    render(<ServiceForm />);

    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Corte' } });
    fireEvent.change(screen.getByPlaceholderText('35000'), { target: { value: '35000' } });

    const file = new File(['fake-image-bytes'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir imagen'), { target: { files: [file] } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(/no se pudo subir la imagen/i)).toBeTruthy();
    expect(getPublicUrlMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Guardar Servicio'));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: null })
    );
  });
});
