import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactFormSheet } from './ContactFormSheet';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// ContactForm now requires BranchContext to include branch_id in inserts.
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({ currentBranch: { id: 'branch-test', name: 'Test Branch', role: 'admin' } }),
}));

const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq     = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'contacts') {
        return {
          select: () => ({ eq: () => ({ single: mockSingle }) }),
          insert: (data: unknown) => { mockInsert(data); return { select: () => ({ single: () => Promise.resolve({ data: { id: 'c1', full_name: 'Nuevo' }, error: null }) }) }; },
          update: (data: unknown) => { mockUpdate(data); return { eq: (field: string, val: string) => { mockEq(field, val); return Promise.resolve({ error: null }); } }; },
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContactFormSheet — modo CREATE', () => {
  it('renderiza el sheet con el título "Nuevo Contacto"', () => {
    render(
      <ContactFormSheet open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
    );
    expect(screen.getByText('Nuevo Contacto')).toBeTruthy();
  });

  it('el formulario empieza vacío', () => {
    render(
      <ContactFormSheet open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
    );
    const nameInput = screen.getByPlaceholderText('Nombre completo') as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  it('llama onSuccess y cierra el sheet al guardar correctamente', async () => {
    const onSuccess    = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ContactFormSheet open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />
    );
    fireEvent.change(screen.getByPlaceholderText('Nombre completo'), {
      target: { value: 'Nuevo Cliente' },
    });
    fireEvent.click(screen.getByText('Guardar Contacto'));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ id: 'c1', full_name: 'Nuevo' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

describe('ContactFormSheet — modo EDIT', () => {
  beforeEach(() => {
    mockSingle.mockResolvedValue({
      data: { id: 'c1', full_name: 'Maria García', ci: '9876543', phone: '0991000111', comment: 'VIP' },
      error: null,
    });
  });

  it('renderiza el sheet con el título "Editar Contacto"', async () => {
    render(
      <ContactFormSheet open={true} onOpenChange={vi.fn()} contactId="c1" onSuccess={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('Editar Contacto')).toBeTruthy());
  });

  it('pre-rellena el nombre con los datos del contacto', async () => {
    render(
      <ContactFormSheet open={true} onOpenChange={vi.fn()} contactId="c1" onSuccess={vi.fn()} />
    );
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText('Nombre completo') as HTMLInputElement;
      expect(nameInput.value).toBe('Maria García');
    });
  });

  it('pre-rellena el teléfono con los datos del contacto', async () => {
    render(
      <ContactFormSheet open={true} onOpenChange={vi.fn()} contactId="c1" onSuccess={vi.fn()} />
    );
    await waitFor(() => {
      const phoneInput = screen.getByPlaceholderText('595 984 123456') as HTMLInputElement;
      expect(phoneInput.value).toBe('0991000111');
    });
  });
});
