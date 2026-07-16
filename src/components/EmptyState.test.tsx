import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { EmptyState } from './EmptyState';

describe('EmptyState icon prop (REQ-RESTYLE-3): lucide component, not emoji string', () => {
  it('renders the passed lucide icon as an svg element', () => {
    const { container } = render(
      <EmptyState icon={Users} title="Sin contactos" message="No hay contactos registrados" />
    );

    expect(screen.getByText('Sin contactos')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders no icon element at all when icon is omitted (no empty slot)', () => {
    const { container } = render(
      <EmptyState title="Sin datos" message="Nada que mostrar" />
    );

    expect(container.querySelector('svg')).toBeNull();
  });
});
