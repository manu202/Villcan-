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
const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();

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
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  }),
}));

describe('ServiceEditPage product fields (description, image_url, category, is_available)', () => {
  beforeEach(() => {
    updateMock.mockClear();
    uploadMock.mockReset();
    getPublicUrlMock.mockReset();
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

  it('uploads a new image file and sends the resulting public URL on submit', async () => {
    uploadMock.mockResolvedValue({ data: { path: 'new-path.png' }, error: null });
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: 'https://cdn.example.com/service-images/new-path.png' },
    });

    render(<ServiceEditPage />);

    await waitFor(() => expect(screen.getByDisplayValue('Corte')).toBeTruthy());

    const file = new File(['fake-image-bytes'], 'nueva.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Imagen'), { target: { files: [file] } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    const [path, uploadedFile] = uploadMock.mock.calls[0];
    expect(path).toContain('nueva.png');
    expect(uploadedFile).toBe(file);
    expect(getPublicUrlMock).toHaveBeenCalledWith(path);

    await waitFor(() =>
      expect(screen.getByDisplayValue('https://cdn.example.com/service-images/new-path.png')).toBeTruthy()
    );

    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        image_url: 'https://cdn.example.com/service-images/new-path.png',
      })
    );
  });

  it('shows an error and keeps the previous image_url when the upload fails', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'Storage error' } });

    render(<ServiceEditPage />);

    await waitFor(() => expect(screen.getByDisplayValue('Corte')).toBeTruthy());

    const file = new File(['fake-image-bytes'], 'nueva.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Imagen'), { target: { files: [file] } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(/no se pudo subir la imagen/i)).toBeTruthy();
    expect(getPublicUrlMock).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('https://example.com/old.png')).toBeTruthy();

    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: 'https://example.com/old.png' })
    );
  });
});
