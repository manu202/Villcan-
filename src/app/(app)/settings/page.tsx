'use client';

import Link from 'next/link';
import { useBranch } from '@/contexts/BranchContext';

interface SettingsCard {
  href: string;
  title: string;
  description: string;
}

const CARDS: SettingsCard[] = [
  {
    href: '/settings/general',
    title: 'General',
    description: 'Comisiones, pagos, arqueo, inventario y color de marca.',
  },
  {
    href: '/settings/branches',
    title: 'Sucursales',
    description: 'Crear, editar y eliminar sucursales.',
  },
  {
    href: '/settings/store',
    title: 'Tienda',
    description: 'Nombre del negocio y WhatsApp por sucursal para la tienda pública.',
  },
  {
    href: '/settings/users',
    title: 'Usuarios',
    description: 'Gestionar el acceso de usuarios a la sucursal actual.',
  },
];

export default function SettingsPage() {
  const { branches } = useBranch();

  const isAdminAnywhere = branches.some((b) => b.user_role === 'admin');

  if (!isAdminAnywhere) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="page-title">Configuración</h1>
        </header>
        <div className="empty-state">
          <p>Acceso restringido</p>
          <p className="page-subtitle">Solo un administrador puede ver esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Configuración</h1>
      </header>

      <div className="card-list">
        {CARDS.map((card) => (
          <Link key={card.href} href={card.href} className="card">
            <span className="card-title">{card.title}</span>
            <span className="card-description">{card.description}</span>
          </Link>
        ))}
      </div>

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 32px;
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--text-secondary);
        }

        .card-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .card {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 20px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
          text-decoration: none;
          transition: border-color 0.15s ease;
        }

        .card:hover {
          border-color: var(--accent);
        }

        .card-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .card-description {
          font-size: 14px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
