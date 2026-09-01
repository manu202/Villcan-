import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import StorePage from './page';
import { DEFAULT_BUSINESS_SETTINGS } from '@/lib/settings';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockRefreshSettings = vi.fn().mockResolvedValue(undefined);

const BRANCH_ROWS = [
  { id: 'b1', name: 'Centro', whatsapp_number: '595981111111', slug: 'mi-negocio-centro', storefront_enabled: true },
  { id: 'b2', name: 'Norte', whatsapp_number: null, slug: 'mi-negocio-norte', storefront_enabled: false },
];

const { selectMock, orderMock, updateMock, eqMock, fromMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  orderMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => fromMock(...args),
  }),
}));

describe('StorePage /settings/store', () => {
  beforeEach(() => {
    mockShowToast.mockReset();
    mockRefreshSettings.mockClear();
    selectMock.mockReset();
    orderMock.mockReset();
    updateMock.mockReset();
    eqMock.mockReset();
    fromMock.mockReset();

    // branches table: .select().order() resolves the branch list
    orderMock.mockResolvedValue({ data: BRANCH_ROWS, error: null });
    selectMock.mockReturnValue({ order: orderMock });
    eqMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock });

    fromMock.mockImplementation((table: string) => {
      if (table === 'branches') {
        return { select: selectMock, update: updateMock };
      }
      if (table === 'business_settings') {
        return { update: updateMock };
      }
      return { select: selectMock, update: updateMock };
    });

    mockUseSettings.mockReturnValue({
      settings: { ...DEFAULT_BUSINESS_SETTINGS, business_name: 'Mi Negocio' },
      refreshSettings: mockRefreshSettings,
    });
  });

  it('renders an access-restricted state when the user is not admin anywhere', () => {
    mockUseBranch.mockReturnValue({ branches: [{ id: 'b1', user_role: 'barber' }] });

    render(<StorePage />);

    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
    expect(screen.queryByLabelText(/nombre del negocio/i)).toBeNull();
  });

  it('renders the business name pre-populated for an admin', () => {
    mockUseBranch.mockReturnValue({ branches: [{ id: 'b1', user_role: 'admin' }] });

    render(<StorePage />);

    const input = screen.getByLabelText(/nombre del negocio/i) as HTMLInputElement;
    expect(input.value).toBe('Mi Negocio');
  });

  it('lists every branch with its WhatsApp input, slug preview, and active/inactive status', async () => {
    mockUseBranch.mockReturnValue({
      branches: [
        { id: 'b1', user_role: 'admin' },
        { id: 'b2', user_role: 'admin' },
      ],
    });

    render(<StorePage />);

    await waitFor(() => expect(screen.getByText('Centro')).toBeTruthy());
    expect(screen.getByText('Norte')).toBeTruthy();

    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('Inactiva')).toBeTruthy();

    // Host comes from window.location (real deploy domain), never hardcoded —
    // only assert the /tienda/<slug> part, which is what the app controls.
    expect(screen.getByText(/\/tienda\/mi-negocio-centro$/)).toBeTruthy();
    expect(screen.getByText(/\/tienda\/mi-negocio-norte$/)).toBeTruthy();

    const centroInput = screen.getByLabelText('WhatsApp', {
      selector: `#whatsapp-b1`,
    }) as HTMLInputElement;
    expect(centroInput.value).toBe('595981111111');
  });

  it('saving the business name updates business_settings and refreshes settings + branches', async () => {
    mockUseBranch.mockReturnValue({ branches: [{ id: 'b1', user_role: 'admin' }] });

    render(<StorePage />);

    await waitFor(() => expect(screen.getByText('Centro')).toBeTruthy());
    fromMock.mockClear();

    const input = screen.getByLabelText(/nombre del negocio/i);
    fireEvent.change(input, { target: { value: 'Nuevo Nombre' } });
    fireEvent.click(document.querySelector('button.btn-primary')!);

    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('business_settings'));
    expect(updateMock).toHaveBeenCalledWith({ business_name: 'Nuevo Nombre' });
    expect(eqMock).toHaveBeenCalledWith('id', 1);
    await waitFor(() => expect(mockRefreshSettings).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Nombre del negocio guardado', 'success')
    );
  });

  it('saving a branch WhatsApp number updates only that branch', async () => {
    mockUseBranch.mockReturnValue({
      branches: [
        { id: 'b1', user_role: 'admin' },
        { id: 'b2', user_role: 'admin' },
      ],
    });

    render(<StorePage />);

    await waitFor(() => expect(screen.getByText('Norte')).toBeTruthy());

    const norteInput = document.getElementById('whatsapp-b2') as HTMLInputElement;
    fireEvent.change(norteInput, { target: { value: '595982222222' } });

    const saveButtons = screen.getAllByText('Guardar');
    // First "Guardar" is the business-name form's submit button; the branch
    // rows each render their own after it.
    fireEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ whatsapp_number: '595982222222' }));
    expect(eqMock).toHaveBeenCalledWith('id', 'b2');
  });

  it('disables the WhatsApp input and save button for a branch the user is not admin on', async () => {
    mockUseBranch.mockReturnValue({
      branches: [
        { id: 'b1', user_role: 'admin' },
        { id: 'b2', user_role: 'barber' },
      ],
    });

    render(<StorePage />);

    await waitFor(() => expect(screen.getByText('Norte')).toBeTruthy());

    const norteInput = document.getElementById('whatsapp-b2') as HTMLInputElement;
    expect(norteInput.disabled).toBe(true);
    expect(screen.getByText(/sin permisos de administrador/i)).toBeTruthy();
  });
});
