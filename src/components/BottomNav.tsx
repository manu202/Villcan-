'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePendingOrdersCount } from '@/hooks/usePendingOrdersCount';

const TABS = [
  { label: 'Caja', href: '/', exact: true },
  { label: 'Pedidos', href: '/orders', exact: false },
  { label: 'Movimientos', href: '/movements', exact: false },
  { label: 'Catálogo', href: '/services', exact: false },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const pendingCount = usePendingOrdersCount();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <nav aria-label="Navegación principal" className="bottom-nav">
      {TABS.map((tab) => {
        const active = isActive(tab.href, tab.exact);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`bottom-nav-tab${active ? ' active' : ''}`}
          >
            <span className="bottom-nav-label">{tab.label}</span>
            {tab.href === '/orders' && pendingCount > 0 && (
              <span data-testid="orders-badge" className="bottom-nav-badge">
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}

      <style>{`
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 40;
          display: flex;
          background: var(--surface);
          border-top: 1px solid var(--border);
          padding-bottom: env(safe-area-inset-bottom);
        }

        .bottom-nav-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 10px 4px;
          min-height: 56px;
          text-decoration: none;
          color: var(--text-secondary);
          position: relative;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.02em;
          transition: color 0.15s;
        }

        .bottom-nav-tab.active {
          color: var(--accent);
        }

        .bottom-nav-label {
          font-size: 11px;
          line-height: 1;
        }

        .bottom-nav-badge {
          position: absolute;
          top: 6px;
          right: calc(50% - 18px);
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 9px;
          background: #ef4444;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
      `}</style>
    </nav>
  );
}
