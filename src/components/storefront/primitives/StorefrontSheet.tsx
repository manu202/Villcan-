'use client';

import { Drawer } from 'vaul';
import type { ReactNode } from 'react';

export interface StorefrontSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Class for the sheet surface itself (vaul.Drawer.Content). Own the visual
   * chrome here (background, border-radius, max-height) — NOT position/
   * transform/transition, which vaul drives itself via inline styles. */
  contentClassName?: string;
  overlayClassName?: string;
  ariaLabel?: string;
  /** vaul.Drawer.Root direction. Defaults to 'bottom' — the app-like bottom
   * sheet the SDD calls for ("Todo ítem al que se le haga tap debe abrir un
   * AppSheet ... desde abajo"). */
  direction?: 'top' | 'bottom' | 'left' | 'right';
  /** Set false to disable vaul's own drag-to-dismiss + tap-outside-to-close —
   * use when the sheet's content owns a competing gesture (e.g. the product
   * sheet's horizontal swipe-between-items) and dismissal should only ever
   * happen through an explicit close button. */
  dismissible?: boolean;
}

/**
 * Thin wrapper over vaul's Drawer — the primitive every storefront sheet
 * (product detail, cart, checkout steps) should render through, replacing
 * the hand-rolled scrim + body-scroll-lock + focus-management each template
 * used to reimplement itself. vaul owns: open/close animation, backdrop,
 * focus trap, body scroll lock, and (when dismissible) drag-to-dismiss.
 */
export function StorefrontSheet({
  open,
  onOpenChange,
  children,
  contentClassName,
  overlayClassName,
  ariaLabel,
  direction = 'bottom',
  dismissible = true,
}: StorefrontSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={direction} dismissible={dismissible}>
      <Drawer.Portal>
        {/* Explicit onClick regardless of `dismissible` — that flag controls
            vaul's own drag-to-dismiss gesture (disabled when the content has
            a competing gesture, e.g. horizontal swipe-between-items), not
            whether tapping the backdrop should close the sheet. */}
        <Drawer.Overlay className={overlayClassName} onClick={() => onOpenChange(false)} />
        <Drawer.Content className={contentClassName} aria-label={ariaLabel}>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
