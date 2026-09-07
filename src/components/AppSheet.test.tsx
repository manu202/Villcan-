import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppSheet } from './AppSheet';

vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="drawer-root">{children}</div> : null,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Overlay: () => <div data-testid="drawer-overlay" />,
    Content: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="drawer-content">{children}</div>
    ),
  },
}));

describe('AppSheet', () => {
  it('renders nothing when open is false', () => {
    render(
      <AppSheet open={false} onOpenChange={vi.fn()} title="Test">
        <p>Content</p>
      </AppSheet>
    );
    expect(screen.queryByTestId('drawer-root')).toBeNull();
    expect(screen.queryByText('Content')).toBeNull();
  });

  it('renders the title and children when open is true', () => {
    render(
      <AppSheet open={true} onOpenChange={vi.fn()} title="Detalle del pedido">
        <p>Order details here</p>
      </AppSheet>
    );
    expect(screen.getByText('Detalle del pedido')).toBeTruthy();
    expect(screen.getByText('Order details here')).toBeTruthy();
  });

  it('calls onOpenChange when the close button is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <AppSheet open={true} onOpenChange={onOpenChange} title="Test">
        <p>Content</p>
      </AppSheet>
    );
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders footer content when provided', () => {
    render(
      <AppSheet open={true} onOpenChange={vi.fn()} title="Test" footer={<button>Guardar</button>}>
        <p>Content</p>
      </AppSheet>
    );
    expect(screen.getByRole('button', { name: /guardar/i })).toBeTruthy();
  });
});
