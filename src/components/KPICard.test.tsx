import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Wallet } from 'lucide-react';
import { KPICard } from './KPICard';

describe('KPICard optional icon prop (REQ-RESTYLE-2): capability only, opt-in', () => {
  it('renders label and formatted value with no icon when icon is omitted (all current callers)', () => {
    const { container } = render(<KPICard label="Balance" value={125000} />);

    expect(screen.getByText('Balance')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the passed lucide icon when a consumer opts in', () => {
    const { container } = render(<KPICard label="Efectivo" value={50000} icon={Wallet} />);

    expect(screen.getByText('Efectivo')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
