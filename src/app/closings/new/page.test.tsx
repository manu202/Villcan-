import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NewClosingPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

vi.mock('@/components/ClosingForm', () => ({
  ClosingForm: () => <div data-testid="closing-form" />,
}));

describe('NewClosingPage admin gate (REQ-CAJA-6)', () => {
  it('renders an access-restricted state when the current branch role is not admin', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', user_role: 'barber' },
    });

    render(<NewClosingPage />);

    expect(screen.queryByTestId('closing-form')).toBeNull();
    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
  });

  it('renders ClosingForm when the current branch role is admin', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', user_role: 'admin' },
    });

    render(<NewClosingPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();
    expect(screen.getByTestId('closing-form')).toBeTruthy();
  });
});
