import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactCard } from './ContactCard';
import type { Contact } from '@/types';

vi.mock('@/lib/utils', () => ({
  formatRelativeDate: (_d: string) => 'hace 3 días',
}));

const BASE: Contact & { lastVisit?: string | null } = {
  id: 'c1',
  full_name: 'Juan Pérez',
  ci: '1234567',
  phone: '0981123456',
  comment: 'Cliente VIP',
  created_at: '2026-01-01T00:00:00Z',
};

describe('ContactCard — avatar y datos', () => {
  it('muestra la inicial del nombre en el avatar', () => {
    render(<ContactCard contact={BASE} onClick={vi.fn()} />);
    expect(screen.getByTestId('contact-avatar')).toBeTruthy();
    expect(screen.getByTestId('contact-avatar').textContent).toBe('J');
  });

  it('muestra el nombre completo', () => {
    render(<ContactCard contact={BASE} onClick={vi.fn()} />);
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
  });

  it('muestra el CI en texto secundario', () => {
    render(<ContactCard contact={BASE} onClick={vi.fn()} />);
    expect(screen.getByText('CI 1234567')).toBeTruthy();
  });

  it('NO muestra CI cuando es null', () => {
    render(<ContactCard contact={{ ...BASE, ci: null }} onClick={vi.fn()} />);
    expect(screen.queryByText(/^CI/)).toBeNull();
  });
});

describe('ContactCard — última visita', () => {
  it('muestra la última visita en formato relativo', () => {
    const contact = { ...BASE, lastVisit: '2026-09-05T10:00:00Z' };
    render(<ContactCard contact={contact} onClick={vi.fn()} />);
    expect(screen.getByText('hace 3 días')).toBeTruthy();
  });

  it('muestra "Sin visitas" cuando no hay lastVisit', () => {
    render(<ContactCard contact={BASE} onClick={vi.fn()} />);
    expect(screen.getByText('Sin visitas')).toBeTruthy();
  });
});

describe('ContactCard — indicador de notas', () => {
  it('muestra indicador de notas cuando tiene comment', () => {
    render(<ContactCard contact={BASE} onClick={vi.fn()} />);
    expect(screen.getByTestId('contact-card-note-indicator')).toBeTruthy();
  });

  it('NO muestra indicador de notas cuando comment es null', () => {
    render(<ContactCard contact={{ ...BASE, comment: null }} onClick={vi.fn()} />);
    expect(screen.queryByTestId('contact-card-note-indicator')).toBeNull();
  });
});

describe('ContactCard — WhatsApp', () => {
  it('muestra botón de WhatsApp cuando tiene teléfono', () => {
    render(<ContactCard contact={BASE} onClick={vi.fn()} />);
    expect(screen.getByLabelText('WhatsApp')).toBeTruthy();
  });

  it('NO muestra botón de WhatsApp cuando phone es null', () => {
    render(<ContactCard contact={{ ...BASE, phone: null }} onClick={vi.fn()} />);
    expect(screen.queryByLabelText('WhatsApp')).toBeNull();
  });

  it('el botón de WhatsApp apunta a wa.me con el número limpio', () => {
    render(<ContactCard contact={BASE} onClick={vi.fn()} />);
    const btn = screen.getByLabelText('WhatsApp') as HTMLAnchorElement;
    expect(btn.href).toContain('wa.me/0981123456');
  });
});

describe('ContactCard — interacciones', () => {
  it('llama onClick con el id del contacto al hacer tap en la tarjeta', () => {
    const handleClick = vi.fn();
    render(<ContactCard contact={BASE} onClick={handleClick} />);
    fireEvent.click(screen.getByTestId('contact-card-c1'));
    expect(handleClick).toHaveBeenCalledWith('c1');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('el botón de WhatsApp NO propaga el click al card', () => {
    const handleClick = vi.fn();
    render(<ContactCard contact={BASE} onClick={handleClick} />);
    fireEvent.click(screen.getByLabelText('WhatsApp'));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
