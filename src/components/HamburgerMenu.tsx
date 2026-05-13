'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthButton } from './AuthButton';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Caja', href: '/', icon: '□' },
  { label: 'Movimientos', href: '/movements', icon: '▤' },
  { label: 'Contactos', href: '/contacts', icon: '○' },
  { label: 'Servicios', href: '/services', icon: '✂' },
  { label: 'Reportes', href: '/reports', icon: '▦' },
];

export function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Don't render on login page
  if (pathname === '/login') return null;

  const closeMenu = useCallback(() => setIsOpen(false), []);

  // Manage body overflow when menu is open (client-side only)
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
          <span className="logo">VILLCAN</span>
          <button className="close-btn" onClick={handleClose} aria-label="Cerrar menú">
            ✕
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
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="drawer-footer">
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
          background: var(--white);
          border: 1px solid var(--gray-200);
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
          background: var(--black);
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
          background: var(--white);
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
          border-bottom: 1px solid var(--gray-200);
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
          border: 1px solid var(--gray-200);
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          color: var(--gray-600);
          transition: all 0.15s ease;
        }

        .close-btn:hover {
          background: var(--gray-100);
          color: var(--black);
        }

        .logo {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.1em;
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
          color: var(--gray-600);
          text-decoration: none;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.15s ease;
        }

        .nav-link:hover {
          background: var(--gray-50);
          color: var(--black);
        }

        .nav-link.active {
          background: var(--gray-100);
          color: var(--black);
        }

        .nav-icon {
          font-size: 18px;
          width: 24px;
          text-align: center;
        }

        .drawer-footer {
          padding: 20px;
          border-top: 1px solid var(--gray-200);
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--gray-600);
        }
      `}</style>
    </>
  );
}