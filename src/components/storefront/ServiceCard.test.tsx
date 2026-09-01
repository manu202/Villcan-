import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceCard } from './ServiceCard';
import type { Service } from '@/types';

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    name: 'Corte clásico',
    price: 35000,
    cost: 0,
    created_at: new Date().toISOString(),
    is_active: true,
    branch_id: null,
    ...overrides,
  };
}

describe('ServiceCard image rendering (image_url)', () => {
  it('renders an <img> with the service image and correct alt text when image_url is set', () => {
    render(
      <ServiceCard
        service={makeService({ image_url: 'https://example.com/corte.png' })}
        qtyInCart={0}
        onAdd={vi.fn()}
      />
    );

    const img = screen.getByAltText('Corte clásico') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe('https://example.com/corte.png');
  });

  it('renders no <img> element when image_url is null', () => {
    const { container } = render(
      <ServiceCard service={makeService({ image_url: null })} qtyInCart={0} onAdd={vi.fn()} />
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('renders no <img> element when image_url is undefined', () => {
    const { container } = render(
      <ServiceCard service={makeService()} qtyInCart={0} onAdd={vi.fn()} />
    );

    expect(container.querySelector('img')).toBeNull();
  });
});
