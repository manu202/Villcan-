import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toggle } from './Toggle';

describe('Toggle (REQ-THEME-6)', () => {
  it('renders role="switch" reflecting the checked prop via aria-checked', () => {
    render(<Toggle checked={true} onChange={() => {}} label="Comisiones" />);

    const toggle = screen.getByRole('switch', { name: 'Comisiones' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('reflects checked=false as aria-checked="false"', () => {
    render(<Toggle checked={false} onChange={() => {}} label="Comisiones" />);

    const toggle = screen.getByRole('switch', { name: 'Comisiones' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange with the flipped value on click', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Comisiones" />);

    fireEvent.click(screen.getByRole('switch', { name: 'Comisiones' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is keyboard-operable: Space toggles', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Comisiones" />);

    const toggle = screen.getByRole('switch', { name: 'Comisiones' });
    fireEvent.keyDown(toggle, { key: ' ' });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is keyboard-operable: Enter toggles', () => {
    const onChange = vi.fn();
    render(<Toggle checked={true} onChange={onChange} label="Comisiones" />);

    const toggle = screen.getByRole('switch', { name: 'Comisiones' });
    fireEvent.keyDown(toggle, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('is not affected by the global 44px min-size rule (dedicated class, explicit size)', () => {
    render(<Toggle checked={false} onChange={() => {}} label="Comisiones" />);

    const toggle = screen.getByRole('switch', { name: 'Comisiones' });
    expect(toggle.className).toContain('toggle');
  });
});
