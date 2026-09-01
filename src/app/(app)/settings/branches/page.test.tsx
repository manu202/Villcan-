import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import BranchesPage from './page';

const mockUseBranch = vi.fn();
const mockSelectBranch = vi.fn();
const mockRefreshBranches = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}));

const { insertMock, updateMock, eqMock, selectMock, fromMock } = vi.hoisted(() => ({
  insertMock: vi.fn().mockResolvedValue({ error: null }),
  updateMock: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  eqMock: vi.fn().mockResolvedValue({ error: null }),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
}));

const STOREFRONT_ROWS = [
  { id: 'b1', whatsapp_number: '595981111111', slug: 'mi-negocio-centro', storefront_enabled: true },
  { id: 'b2', whatsapp_number: null, slug: null, storefront_enabled: false },
];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => fromMock(...args),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  }),
}));

describe('BranchesPage /settings/branches (REQ-SETTINGSREORG-3, REQ-SETTINGSREORG-9)', () => {
  beforeEach(() => {
    mockShowToast.mockReset();
    mockSelectBranch.mockReset();
    mockRefreshBranches.mockReset();
    mockUseSettings.mockReset();
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero' } });
    insertMock.mockClear();
    updateMock.mockClear();
    updateMock.mockReturnValue({ eq: eqMock });
    eqMock.mockClear();
    eqMock.mockResolvedValue({ error: null });
    selectMock.mockReset();
    selectMock.mockResolvedValue({ data: STOREFRONT_ROWS, error: null });
    fromMock.mockReset();
    fromMock.mockImplementation((table: string) => {
      if (table === 'branches') {
        return {
          select: selectMock,
          update: updateMock,
          insert: insertMock,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return { insert: insertMock };
    });
  });

  it('renders the configured staff_label as the role tag instead of the hardcoded "Barbero"', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Mozo' } });
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin' },
        { id: 'b2', name: 'Sucursal Norte', address: null, user_role: 'barber' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    expect(screen.getByText('Tu rol: Mozo')).toBeTruthy();
  });

  it('renders a different configured staff_label without hardcoding "Mozo" either', () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Operador' } });
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin' },
        { id: 'b2', name: 'Sucursal Norte', address: null, user_role: 'barber' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    expect(screen.getByText('Tu rol: Operador')).toBeTruthy();
  });

  it('renders an access-restricted state when the user is not admin anywhere', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: null,
      branches: [{ id: 'b1', name: 'Centro', user_role: 'barber' }],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
    expect(screen.queryByText(/\+nueva/i)).toBeNull();
  });

  it('renders branch CRUD (no user-access UI) when admin on at least one branch', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [{ id: 'b1', name: 'Centro', address: null, user_role: 'admin' }],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();
    expect(screen.getByText(/\+nueva/i)).toBeTruthy();
    expect(screen.queryByText(/\+usuario/i)).toBeNull();
    await waitFor(() => expect(screen.getByText('Editar')).toBeTruthy());
  });

  it('hides Editar/Eliminar for a branch where the user is not admin, even if admin elsewhere', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin' },
        { id: 'b2', name: 'Sucursal Norte', address: null, user_role: 'barber' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    const northItem = screen.getByText('Sucursal Norte').closest('li')!;
    expect(within(northItem).queryByText('Editar')).toBeNull();
    expect(within(northItem).getByText(/sin permisos de administrador/i)).toBeTruthy();
  });

  it('lets the user switch the active branch from a non-current row', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin' },
        { id: 'b2', name: 'Sucursal Norte', address: null, user_role: 'admin' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    const northItem = screen.getByText('Sucursal Norte').closest('li')!;
    fireEvent.click(within(northItem).getByText(/usar esta sucursal/i));
    expect(mockSelectBranch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b2' })
    );
  });

  it('submits only name/address when creating a branch (no vertical/whatsapp fields on create)', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [{ id: 'b1', name: 'Centro', address: null, user_role: 'admin' }],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    fireEvent.click(screen.getByText(/\+nueva/i));

    // The vertical/WhatsApp fields only appear when editing an existing branch.
    expect(screen.queryByLabelText(/rubro/i)).toBeNull();
    expect(screen.queryByLabelText(/whatsapp/i)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Nueva sucursal' } });
    fireEvent.change(screen.getByPlaceholderText(/dirección/i), {
      target: { value: 'Av. Siempre Viva 123' },
    });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nueva sucursal',
        address: 'Av. Siempre Viva 123',
      })
    );
    const insertedPayload = insertMock.mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty('vertical');
    expect(insertedPayload).not.toHaveProperty('whatsapp_number');
  });

  it('shows Rubro and WhatsApp fields, plus the storefront badge and slug preview, when editing a branch', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin', vertical: 'gastronomy' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    await waitFor(() => expect(selectMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Editar'));

    const vertical = screen.getByLabelText(/rubro/i) as HTMLSelectElement;
    expect(vertical.value).toBe('gastronomy');

    const whatsapp = screen.getByLabelText(/whatsapp/i) as HTMLInputElement;
    expect(whatsapp.value).toBe('595981111111');

    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText(/\/tienda\/mi-negocio-centro$/)).toBeTruthy();
  });

  it('saving an edited branch sends name, address, vertical and whatsapp_number together', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin', vertical: 'generic' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    await waitFor(() => expect(selectMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Editar'));

    fireEvent.change(screen.getByLabelText(/rubro/i), { target: { value: 'barbershop' } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: '595987654321' } });

    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Centro',
          vertical: 'barbershop',
          whatsapp_number: '595987654321',
        })
      )
    );
    expect(eqMock).toHaveBeenCalledWith('id', 'b1');
  });

  it('shows a placeholder message when the branch has no slug yet', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin' },
        { id: 'b2', name: 'Sucursal Norte', address: null, user_role: 'admin' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    await waitFor(() => expect(selectMock).toHaveBeenCalled());

    const northItem = screen.getByText('Sucursal Norte').closest('li')!;
    fireEvent.click(within(northItem).getByText('Editar'));

    expect(screen.getByText('La URL se generará al guardar')).toBeTruthy();
    expect(screen.getByText('Inactiva')).toBeTruthy();
  });
});
