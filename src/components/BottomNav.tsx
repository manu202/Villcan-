'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePendingOrdersCount } from '@/hooks/usePendingOrdersCount';

const TABS = [
  { label: 'Caja', href: '/', exact: true },
  { label: 'Pedidos', href: '/orders', exact: false },
  { label: 'Movimientos', href: '/movements', exact: false },
  { label: 'Contactos', href: '/contacts', exact: false },
  { label: 'Catálogo', href: '/services', exact: false },
] as const;

function TabIcon({ label, color }: { label: string; color: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2.6,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    'aria-hidden': true,
  };

  switch (label) {
    case 'Caja':
      return (
        <svg {...common}>
          <rect x="3" y="9" width="18" height="11" rx="1" />
          <path d="M3 9l2-5h14l2 5" />
        </svg>
      );
    case 'Pedidos':
      return (
        <svg {...common}>
          <path d="M6 4h12l-1.5 9h-9z" />
          <circle cx="9" cy="19" r="1.4" />
          <circle cx="16" cy="19" r="1.4" />
        </svg>
      );
    case 'Movimientos':
      return (
        <svg {...common}>
          <path d="M3 12h4l3 8 4-16 3 8h4" />
        </svg>
      );
    case 'Contactos':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
        </svg>
      );
    case 'Catálogo':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" />
          <rect x="13" y="4" width="7" height="7" />
          <rect x="4" y="13" width="7" height="7" />
          <rect x="13" y="13" width="7" height="7" />
        </svg>
      );
    default:
      return null;
  }
}

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
        const iconColor = active
          ? 'var(--refresh-nav-active-ink, #fff8f3)'
          : 'var(--refresh-ink-muted, var(--text-secondary))';
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`bottom-nav-tab${active ? ' active' : ''}`}
          >
            <TabIcon label={tab.label} color={iconColor} />
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
          left: 16px;
          right: 16px;
          bottom: calc(18px + env(safe-area-inset-bottom));
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
          padding: 10px;
          border-radius: var(--refresh-radius-card, 16px);
          background: var(--refresh-surface-glass, rgba(255, 255, 255, 0.72));
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: var(--refresh-border-hard, 2px solid rgba(36, 27, 22, 0.85));
          box-shadow: var(--refresh-shadow-hard, 6px 6px 0 rgba(36, 27, 22, 0.85));
          font-family: var(--refresh-font-sans, inherit);
        }

        .bottom-nav-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          min-width: 44px;
          min-height: 44px;
          padding: 8px 4px;
          border-radius: var(--refresh-radius-control, 10px);
          text-decoration: none;
          color: var(--refresh-ink-muted, var(--text-secondary));
          position: relative;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
          transition: background-color 0.15s, color 0.15s;
        }

        .bottom-nav-tab.active {
          background: var(--refresh-accent, var(--accent));
          color: var(--refresh-nav-active-ink, #fff8f3);
          font-weight: 700;
        }

        .bottom-nav-label {
          font-size: 10px;
          line-height: 1;
        }

        .bottom-nav-badge {
          position: absolute;
          top: 2px;
          right: 2px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 8px;
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
