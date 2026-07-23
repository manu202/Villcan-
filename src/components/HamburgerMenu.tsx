'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sun,
  Moon,
  Monitor,
  LayoutDashboard,
  ArrowRightLeft,
  Users,
  Scissors,
  BarChart3,
  Archive,
  Settings,
  AlertOctagon,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AuthButton } from './AuthButton';
import { BranchSelector } from './BranchSelector';
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext';

const THEME_CYCLE: ThemePreference[] = ['system', 'light', 'dark'];

const THEME_META: Record<ThemePreference, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: 'Tema: Automático' },
  light: { icon: Sun, label: 'Tema: Claro' },
  dark: { icon: Moon, label: 'Tema: Oscuro' },
};

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { icon: Icon, label } = THEME_META[theme];

  const handleClick = () => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="theme-toggle-label">{label}</span>
    </button>
  );
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { label: 'Caja', href: '/', icon: LayoutDashboard },
  { label: 'Movimientos', href: '/movements', icon: ArrowRightLeft },
  { label: 'Contactos', href: '/contacts', icon: Users },
  { label: 'Servicios', href: '/services', icon: Scissors },
  { label: 'Reportes', href: '/reports', icon: BarChart3 },
  { label: 'Cierres de Caja', href: '/closings', icon: Archive },
  { label: 'Configuración', href: '/settings', icon: Settings },
  { label: 'Errores de usuarios', href: '/errors', icon: AlertOctagon },
];

export function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const closeMenu = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (pathname === '/login') return null;

  const handleClose = () => {
    closeMenu();
  };

  const handleToggle = () => {
    setIsOpen(prev => !prev);
  };

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={handleToggle}
        className="hamburger-btn"
        aria-label="Menu"
        aria-expanded={isOpen}
      >
        <span className={`hamburger-icon ${isOpen ? 'open' : ''}`}>
          <span />
          <span />
          <span />
        </span>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="overlay"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <nav className={`drawer ${isOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="drawer-header">
          <div className="drawer-header-left">
            <span className="logo">VILLCAN</span>
            <BranchSelector />
          </div>
          <button className="close-btn" onClick={handleClose} aria-label="Cerrar menú">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <ul className="nav-list">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`nav-link ${pathname === item.href ? 'active' : ''}`}
                onClick={handleClose}
              >
                <item.icon size={18} className="nav-icon" aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="drawer-footer">
          <ThemeToggle />
          <AuthButton />
        </div>
      </nav>

      <style>{`
        .hamburger-btn {
          position: fixed;
          top: 16px;
          left: 16px;
          z-index: 1001;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
        }

        .hamburger-icon {
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: 20px;
        }

        .hamburger-icon span {
          display: block;
          height: 2px;
          background: var(--text-primary);
          border-radius: 1px;
          transition: all 0.3s ease;
        }

        .hamburger-icon.open span:nth-child(1) {
          transform: translateY(7px) rotate(45deg);
        }

        .hamburger-icon.open span:nth-child(2) {
          opacity: 0;
        }

        .hamburger-icon.open span:nth-child(3) {
          transform: translateY(-7px) rotate(-45deg);
        }

        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .drawer {
          position: fixed;
          top: 0;
          left: 0;
          width: 280px;
          height: 100vh;
          background: var(--surface);
          z-index: 1002;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          display: flex;
          flex-direction: column;
        }

        .drawer.open {
          transform: translateX(0);
        }

        .drawer-header {
          padding: 24px 20px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          color: var(--text-secondary);
          transition: all 0.15s ease;
        }

        .close-btn:hover {
          background: var(--accent-subtle);
          color: var(--text-primary);
        }

        .logo {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.1em;
        }

        .drawer-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .nav-list {
          list-style: none;
          padding: 16px 0;
          flex: 1;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.15s ease;
        }

        .nav-link:hover {
          background: var(--accent-subtle);
          color: var(--text-primary);
        }

        .nav-link.active {
          background: var(--accent-subtle);
          color: var(--text-primary);
        }

        .nav-icon {
          width: 24px;
          flex-shrink: 0;
        }

        .drawer-footer {
          padding: 20px;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .theme-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 500;
          width: 100%;
          transition: all 0.15s ease;
        }

        .theme-toggle:hover {
          background: var(--accent-subtle);
          color: var(--text-primary);
        }

        .theme-toggle-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
        }
      `}</style>
    </>
  );
}