import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Wallet } from 'lucide-react';
import { ErrorState } from './ErrorState';

describe('ErrorState icon prop (REQ-RESTYLE-3): defaults to AlertTriangle, no emoji glyph', () => {
  it('renders a default lucide icon (AlertTriangle) and no "⚠️" emoji text', () => {
    const { container } = render(<ErrorState />);

    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.queryByText('⚠️')).toBeNull();
  });

  it('renders a custom icon override instead of the default when passed', () => {
    const { container } = render(<ErrorState icon={Wallet} message="Error de red" />);

    expect(screen.getByText('Error de red')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.queryByText('⚠️')).toBeNull();
  });
});
