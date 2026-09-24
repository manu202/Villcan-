'use client';

import { Drawer } from 'vaul';
import { X } from 'lucide-react';

interface AppSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AppSheet({ open, onOpenChange, title, children, footer }: AppSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="app-sheet-overlay" />
        <Drawer.Content className="app-sheet-content">
          <div className="app-sheet-header">
            <div className="app-sheet-handle" aria-hidden="true" />
            <div className="app-sheet-title-row">
              <h2 className="app-sheet-title">{title}</h2>
              <button
                type="button"
                className="app-sheet-close"
                aria-label="Cerrar"
                onClick={() => onOpenChange(false)}
              >
                <X size={16} strokeWidth={2.8} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="app-sheet-body">{children}</div>
          {footer && <div className="app-sheet-footer">{footer}</div>}

          <style>{`
            .app-sheet-overlay {
              position: fixed;
              inset: 0;
              background: rgba(36, 27, 22, 0.55);
              z-index: 50;
            }

            .app-sheet-content {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              z-index: 51;
              background: var(--refresh-bg, var(--surface));
              border-top: 3px solid rgba(36, 27, 22, 0.9);
              border-radius: var(--refresh-radius-card, 16px) var(--refresh-radius-card, 16px) 0 0;
              box-shadow: 0 -8px 0 rgba(36, 27, 22, 0.85);
              max-height: 92dvh;
              display: flex;
              flex-direction: column;
              outline: none;
              font-family: var(--refresh-font-sans, inherit);
              color: var(--refresh-ink, var(--text-primary));
            }

            /* QA-8 (2026-09-22): AppSheet had zero responsive treatment —
               on desktop it still rendered as a full-width mobile bottom
               sheet, leaving most of the viewport empty behind it. This app
               is web, so the standard is to be responsive: above a tablet
               breakpoint, the sheet becomes a centered modal card instead
               of a bottom sheet, matching ordinary desktop dialog
               conventions while every screen that renders through
               AppSheet keeps working unchanged (this is the single shared
               component all of them use). */
            @media (min-width: 768px) {
              .app-sheet-content {
                bottom: auto;
                left: 50%;
                right: auto;
                top: 50%;
                transform: translate(-50%, -50%);
                width: min(560px, 90vw);
                max-height: 85vh;
                border: var(--refresh-border-hard, 1px solid var(--border));
                border-radius: var(--refresh-radius-card, 16px);
                box-shadow: var(--refresh-shadow-hard, none);
              }
            }

            .app-sheet-header {
              padding: 12px 16px 0;
              flex-shrink: 0;
            }

            .app-sheet-handle {
              width: 44px;
              height: 5px;
              background: rgba(36, 27, 22, 0.3);
              border-radius: 3px;
              margin: 6px auto 12px;
            }

            .app-sheet-title-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 12px;
              border-bottom: 2px solid rgba(36, 27, 22, 0.15);
            }

            .app-sheet-title {
              font-size: 18px;
              font-weight: 700;
              color: var(--refresh-ink, var(--text-primary));
            }

            .app-sheet-close {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 32px;
              height: 32px;
              min-width: 32px;
              min-height: 32px;
              border-radius: 8px;
              background: rgba(255, 255, 255, 0.7);
              border: 2px solid rgba(36, 27, 22, 0.85);
              color: var(--refresh-ink, var(--text-secondary));
              cursor: pointer;
            }

            .app-sheet-body {
              flex: 1;
              overflow-y: auto;
              padding: 16px;
              -webkit-overflow-scrolling: touch;
            }

            .app-sheet-footer {
              padding: 12px 16px;
              padding-bottom: calc(12px + env(safe-area-inset-bottom));
              border-top: 2px solid rgba(36, 27, 22, 0.15);
              flex-shrink: 0;
            }
          `}</style>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
