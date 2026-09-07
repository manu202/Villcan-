import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NewClosingPage from './page';

const mockBack = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

vi.mock('@/components/AppSheet', () => ({
  AppSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="app-sheet">{children}</div> : null,
}));

vi.mock('@/components/ClosingWizard', () => ({
  ClosingWizard: () => <div data-testid="closing-wizard" />,
}));

describe('NewClosingPage admin gate (REQ-CAJA-6)', () => {
  it('renders an access-restricted state when the current branch role is not admin', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', user_role: 'user' },
    });

    render(<NewClosingPage />);

    expect(screen.queryByTestId('closing-wizard')).toBeNull();
    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
  });

  it('renders ClosingWizard inside AppSheet when the current branch role is admin', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', user_role: 'admin' },
    });

    render(<NewClosingPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();
    expect(screen.getByTestId('app-sheet')).toBeTruthy();
    expect(screen.getByTestId('closing-wizard')).toBeTruthy();
  });
});
