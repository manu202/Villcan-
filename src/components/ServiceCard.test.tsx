import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServiceCard } from './ServiceCard';
import type { Service } from '@/types';

vi.mock('@/lib/utils', () => ({
  formatGuaranies: (n: number) => `₲ ${n.toLocaleString()}`,
}));

vi.mock('./Toggle', () => ({
  Toggle: ({ checked, onChange, disabled, label }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    label: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid="service-toggle"
    />
  ),
}));

const BASE_SERVICE: Service = {
  id: 's1',
  name: 'Lomo Completo',
  price: 25000,
  is_active: true,
  is_available: true,
  branch_id: 'b1',
  cost: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('ServiceCard — layout', () => {
  it('muestra el nombre del servicio', () => {
    render(<ServiceCard service={BASE_SERVICE} onToggle={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText('Lomo Completo')).toBeTruthy();
  });

  it('muestra el precio formateado', () => {
    render(<ServiceCard service={BASE_SERVICE} onToggle={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText(/25\.000/)).toBeTruthy();
  });

  it('muestra el toggle en estado ON cuando is_available=true', () => {
    render(<ServiceCard service={BASE_SERVICE} onToggle={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('muestra el toggle en estado OFF cuando is_available=false', () => {
    const service = { ...BASE_SERVICE, is_available: false };
    render(<ServiceCard service={service} onToggle={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('tiene data-testid con el id del servicio', () => {
    render(<ServiceCard service={BASE_SERVICE} onToggle={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByTestId('service-card-s1')).toBeTruthy();
  });
});

describe('ServiceCard — apariencia atenuada', () => {
  it('aplica data-unavailable cuando is_available=false', () => {
    const service = { ...BASE_SERVICE, is_available: false };
    render(<ServiceCard service={service} onToggle={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByTestId('service-card-s1').getAttribute('data-unavailable')).toBe('true');
  });

  it('no aplica data-unavailable cuando is_available=true', () => {
    render(<ServiceCard service={BASE_SERVICE} onToggle={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByTestId('service-card-s1').getAttribute('data-unavailable')).toBeNull();
  });
});

describe('ServiceCard — toggle optimista', () => {
  it('tap en toggle llama onToggle con estado invertido (true→false)', () => {
    const onToggle = vi.fn();
    render(<ServiceCard service={BASE_SERVICE} onToggle={onToggle} onClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('s1', false);
  });

  it('tap en toggle llama onToggle con estado invertido (false→true)', () => {
    const onToggle = vi.fn();
    const service = { ...BASE_SERVICE, is_available: false };
    render(<ServiceCard service={service} onToggle={onToggle} onClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('s1', true);
  });
});

describe('ServiceCard — navegación', () => {
  it('tap en la card (fuera del toggle) llama onClick con el id del servicio', () => {
    const onClick = vi.fn();
    render(<ServiceCard service={BASE_SERVICE} onToggle={vi.fn()} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('service-card-s1'));
    expect(onClick).toHaveBeenCalledWith('s1');
  });

  it('tap en el toggle NO propaga el onClick de la card', () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    render(<ServiceCard service={BASE_SERVICE} onToggle={onToggle} onClick={onClick} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
