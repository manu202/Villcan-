'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatGuaranies, formatDate } from '@/lib/utils';
import { getContactVisitAggregate } from '@/lib/contactAggregates';
import { AppSheet } from './AppSheet';
import type { Contact, MovementWithDetails } from '@/types';

interface ContactDetailSheetProps {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (id: string) => void;
}

export function ContactDetailSheet({ contactId, open, onOpenChange, onEdit }: ContactDetailSheetProps) {
  const [contact, setContact]     = useState<Contact | null>(null);
  const [movements, setMovements] = useState<MovementWithDetails[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const supabase = createClient();

    Promise.all([
      supabase.from('contacts').select('id, full_name, ci, phone, comment, created_at').eq('id', contactId).single(),
      supabase.from('movements')
        .select('id, type, amount_charged, income, expense, created_at, service:services(name)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]).then(([contactRes, movRes]) => {
      setContact(contactRes.data ?? null);
      setMovements((movRes.data ?? []) as unknown as MovementWithDetails[]);
      setLoading(false);
    });
  }, [open, contactId]);

  const totalSpent = movements.reduce((sum, m) => sum + (m.amount_charged ?? 0), 0);
  const { lastVisit } = getContactVisitAggregate(movements);

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={contact?.full_name ?? 'Contacto'}
      footer={
        contact && (
          <button
            type="button"
            className="cds-edit-btn"
            onClick={() => onEdit(contactId)}
          >
            Editar
          </button>
        )
      }
    >
      {loading || !contact ? (
        <div data-testid="cds-loading" className="cds-loading">Cargando...</div>
      ) : (
        <div className="cds-body">
          {/* Datos del contacto */}
          <section className="cds-section">
            <div className="cds-info-row">
              {contact.ci && <span className="cds-label">CI {contact.ci}</span>}
              {contact.phone && <span className="cds-label">{contact.phone}</span>}
              {contact.comment && <p className="cds-comment">{contact.comment}</p>}
            </div>
          </section>

          {/* Stats */}
          <section className="cds-section cds-stats">
            <div className="cds-stat">
              <span className="cds-stat-value">{movements.length}</span>
              <span className="cds-stat-label">Visitas</span>
            </div>
            <div className="cds-stat">
              <span className="cds-stat-value">{formatGuaranies(totalSpent)}</span>
              <span className="cds-stat-label">Total</span>
            </div>
            <div className="cds-stat">
              <span className="cds-stat-value">{lastVisit ? formatDate(lastVisit) : '—'}</span>
              <span className="cds-stat-label">Última visita</span>
            </div>
          </section>

          {/* Historial */}
          {movements.length > 0 && (
            <section className="cds-section">
              <p className="cds-section-title">Historial reciente</p>
              <ul className="cds-movement-list">
                {movements.map((m) => (
                  <li key={m.id} className="cds-movement-item">
                    <span className="cds-movement-service">{m.service?.name ?? '—'}</span>
                    <span className="cds-movement-amount">{formatGuaranies(m.amount_charged ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <style>{`
        .cds-loading {
          padding: 32px;
          text-align: center;
          color: var(--text-secondary);
        }
        .cds-body {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .cds-section {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cds-info-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cds-label {
          font-size: 14px;
          color: var(--text-secondary);
        }
        .cds-comment {
          font-size: 14px;
          color: var(--text-secondary);
          font-style: italic;
          margin: 0;
        }
        .cds-stats {
          flex-direction: row;
          gap: 8px;
        }
        .cds-stat {
          flex: 1;
          padding: 14px 12px;
          background: var(--surface-elevated, var(--surface));
          border: 1px solid var(--border);
          border-radius: 10px;
          text-align: center;
        }
        .cds-stat-value {
          display: block;
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 2px;
          font-variant-numeric: tabular-nums;
        }
        .cds-stat-label {
          font-size: 11px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .cds-section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-secondary);
          margin: 0 0 8px;
        }
        .cds-movement-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--border);
          border-radius: 10px;
          overflow: hidden;
        }
        .cds-movement-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          background: var(--surface);
          font-size: 14px;
        }
        .cds-movement-service {
          color: var(--text-primary);
          font-weight: 500;
        }
        .cds-movement-amount {
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }
        .cds-edit-btn {
          width: 100%;
          padding: 14px;
          background: var(--surface-elevated, var(--surface));
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          cursor: pointer;
        }
      `}</style>
    </AppSheet>
  );
}
