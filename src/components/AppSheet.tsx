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
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="app-sheet-body">{children}</div>
          {footer && <div className="app-sheet-footer">{footer}</div>}

          <style>{`
            .app-sheet-overlay {
              position: fixed;
              inset: 0;
              background: rgba(0, 0, 0, 0.4);
              z-index: 50;
            }

            .app-sheet-content {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              z-index: 51;
              background: var(--surface);
              border-radius: 16px 16px 0 0;
              max-height: 92dvh;
              display: flex;
              flex-direction: column;
              outline: none;
            }

            .app-sheet-header {
              padding: 12px 16px 0;
              flex-shrink: 0;
            }

            .app-sheet-handle {
              width: 36px;
              height: 4px;
              background: var(--border);
              border-radius: 2px;
              margin: 0 auto 12px;
            }

            .app-sheet-title-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 12px;
              border-bottom: 1px solid var(--border);
            }

            .app-sheet-title {
              font-size: 17px;
              font-weight: 600;
              color: var(--text-primary);
            }

            .app-sheet-close {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: var(--surface);
              border: 1px solid var(--border);
              color: var(--text-secondary);
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
              border-top: 1px solid var(--border);
              flex-shrink: 0;
            }
          `}</style>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
