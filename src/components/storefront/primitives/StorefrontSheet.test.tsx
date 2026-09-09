import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StorefrontSheet } from './StorefrontSheet';

vi.mock('vaul', () => ({
  Drawer: {
    Root: ({
      open,
      dismissible,
      children,
    }: {
      open: boolean;
      dismissible?: boolean;
      children: React.ReactNode;
    }) =>
      open ? (
        <div data-testid="drawer-root" data-dismissible={String(dismissible)}>
          {children}
        </div>
      ) : null,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Overlay: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
      <div data-testid="drawer-overlay" className={className} onClick={onClick} />
    ),
    Content: ({
      className,
      'aria-label': ariaLabel,
      children,
    }: {
      className?: string;
      'aria-label'?: string;
      children: React.ReactNode;
    }) => (
      <div data-testid="drawer-content" className={className} aria-label={ariaLabel}>
        {children}
      </div>
    ),
  },
}));

describe('StorefrontSheet', () => {
  it('renders nothing when open is false', () => {
    render(
      <StorefrontSheet open={false} onOpenChange={vi.fn()}>
        <p>Content</p>
      </StorefrontSheet>
    );
    expect(screen.queryByTestId('drawer-root')).toBeNull();
    expect(screen.queryByText('Content')).toBeNull();
  });

  it('renders children when open is true', () => {
    render(
      <StorefrontSheet open={true} onOpenChange={vi.fn()}>
        <p>Product detail</p>
      </StorefrontSheet>
    );
    expect(screen.getByText('Product detail')).toBeTruthy();
  });

  it('calls onOpenChange(false) when the overlay is clicked, regardless of dismissible', () => {
    const onOpenChange = vi.fn();
    render(
      <StorefrontSheet open={true} onOpenChange={onOpenChange} dismissible={false}>
        <p>Content</p>
      </StorefrontSheet>
    );
    fireEvent.click(screen.getByTestId('drawer-overlay'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('passes dismissible through to Drawer.Root', () => {
    render(
      <StorefrontSheet open={true} onOpenChange={vi.fn()} dismissible={false}>
        <p>Content</p>
      </StorefrontSheet>
    );
    expect(screen.getByTestId('drawer-root').dataset.dismissible).toBe('false');
  });

  it('applies contentClassName and ariaLabel to Drawer.Content', () => {
    render(
      <StorefrontSheet
        open={true}
        onOpenChange={vi.fn()}
        contentClassName="gt-sheet"
        ariaLabel="Mozzarella"
      >
        <p>Content</p>
      </StorefrontSheet>
    );
    const content = screen.getByTestId('drawer-content');
    expect(content.className).toBe('gt-sheet');
    expect(content.getAttribute('aria-label')).toBe('Mozzarella');
  });
});
