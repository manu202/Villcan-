import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactForm } from './ContactForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// TDD (RED→GREEN): ContactForm now reads currentBranch from useBranch() and
// includes branch_id in the INSERT payload for new contacts.
const mockCurrentBranch = { id: 'branch-abc', name: 'Villcan Centro', role: 'admin' };
let currentBranchOverride: typeof mockCurrentBranch | null = mockCurrentBranch;

vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({ currentBranch: currentBranchOverride }),
}));

const mockInsert = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      insert: (payload: unknown) => {
        mockInsert(payload);
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'new-contact-id', full_name: 'Test User' },
              error: null,
            }),
          }),
        };
      },
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }),
}));

describe('ContactForm — create mode', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    currentBranchOverride = mockCurrentBranch;
  });

  it('includes branch_id in the INSERT payload when creating a new contact', async () => {
    const onSuccess = vi.fn();
    render(<ContactForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Nombre completo'), {
      target: { value: 'María López' },
    });
    fireEvent.change(screen.getByPlaceholderText('595 984 123456'), {
      target: { value: '0991234567' },
    });

    fireEvent.click(screen.getByText('Guardar Contacto'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalled());

    const payload = mockInsert.mock.calls[0][0];
    expect(payload).toMatchObject({ branch_id: 'branch-abc' });
    expect(payload).toMatchObject({ full_name: 'María López' });
  });

  // Found live 2026-09-23 while QA-ing the contact search fix: a contact
  // created with phone "0981555444" (how anyone actually types a Paraguayan
  // number) saved with zero normalization — its wa.me link came out as
  // wa.me/0981555444, missing the 595 country code entirely. This is the
  // same phone-formatting bug class already fixed in CheckoutForm.tsx/
  // CheckoutStep.tsx/searchContacts (QA-2) — a 4th occurrence.
  it('normalizes the phone number before saving (strips local leading 0, prepends 595)', async () => {
    const onSuccess = vi.fn();
    render(<ContactForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Nombre completo'), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByPlaceholderText('595 984 123456'), {
      target: { value: '0981555444' },
    });

    fireEvent.click(screen.getByText('Guardar Contacto'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalled());

    const payload = mockInsert.mock.calls[0][0] as { phone: string | null };
    expect(payload.phone).toBe('595981555444');
  });

  it('shows an error and does NOT call insert when there is no currentBranch', async () => {
    currentBranchOverride = null;
    render(<ContactForm />);

    fireEvent.change(screen.getByPlaceholderText('Nombre completo'), {
      target: { value: 'Sin Sucursal' },
    });

    fireEvent.click(screen.getByText('Guardar Contacto'));

    await waitFor(() =>
      expect(screen.getByText(/seleccioná una sucursal/i)).toBeTruthy()
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('ContactForm — edit mode', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    currentBranchOverride = mockCurrentBranch;
  });

  it('does NOT include branch_id in the UPDATE payload (branch cannot be changed via edit)', async () => {
    // In edit mode, ContactForm calls .update(), not .insert(), so mockInsert is never called.
    render(<ContactForm contactId="existing-contact-1" initialData={{ full_name: 'Existing' }} />);

    fireEvent.change(screen.getByPlaceholderText('Nombre completo'), {
      target: { value: 'Updated Name' },
    });

    fireEvent.click(screen.getByText('Guardar Contacto'));

    // insert should NOT have been called in edit mode
    await waitFor(() => expect(mockInsert).not.toHaveBeenCalled());
  });
});
