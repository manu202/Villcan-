'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Contact, MovementWithDetails } from '@/types';
import { formatGuaranies, formatDate, getMovementTypeLabel } from '@/lib/utils';

export default function ContactDetailPage() {
  const params = useParams();
  const contactId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [movements, setMovements] = useState<MovementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!contactId) return;

    const fetchData = async () => {
      const supabase = createClient();

      const [contactResult, movementsResult] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, full_name, ci, phone, comment, created_at')
          .eq('id', contactId)
          .single(),
        supabase
          .from('movements')
          .select(`
            id, type, amount_charged, income, expense, payment_method, comment, created_at,
            service:services(name)
          `)
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false }),
      ]);

      if (contactResult.error) {
        setError('Contacto no encontrado');
        setLoading(false);
        return;
      }

      setContact(contactResult.data);
      setMovements((movementsResult.data || []) as unknown as MovementWithDetails[]);
      setLoading(false);
    };

    fetchData();
  }, [contactId]);

  if (loading) {
    return (
      <div className="page">
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <Link href="/contacts" className="back-btn">←</Link>
          <h1 className="page-title">Contacto</h1>
        </header>
        <div className="error-state">{error || 'Contacto no encontrado'}</div>
      </div>
    );
  }

  const totalSpent = movements.reduce((sum, m) => sum + (m.amount_charged || 0), 0);

  return (
    <div className="page">
      <header className="page-header flex-header">
        <Link href="/contacts" className="back-btn">←</Link>
        <h1 className="page-title">{contact.full_name}</h1>
        <Link href={`/contacts/${contactId}/edit`} className="edit-btn">Editar</Link>
      </header>

      <section className="section">
        <div className="contact-card">
          <div className="contact-avatar">
            {contact.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="contact-details">
            {contact.ci && <span className="detail-row">CI: {contact.ci}</span>}
            {contact.phone && <span className="detail-row">{contact.phone}</span>}
            {contact.comment && <span className="detail-row comment">{contact.comment}</span>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="stats-row">
          <div className="stat">
            <span className="stat-value">{movements.length}</span>
            <span className="stat-label">Visitas</span>
          </div>
          <div className="stat">
            <span className="stat-value">{formatGuaranies(totalSpent)}</span>
            <span className="stat-label">Total gastado</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Historial</h2>
        {movements.length === 0 ? (
          <p className="empty-text">Sin movimientos registrados</p>
        ) : (
          <ul className="movement-list">
            {movements.map((m) => (
              <li key={m.id} className="movement-item">
                <div className="movement-info">
                  <span className="movement-type">{getMovementTypeLabel(m.type)}</span>
                  <span className="movement-service">{m.service?.name}</span>
                </div>
                <div className="movement-amount">
                  <span className="amount">+{formatGuaranies(m.amount_charged || 0)}</span>
                  <span className="movement-date">
                    {formatDate(m.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .flex-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .back-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          background: var(--gray-100);
          border-radius: 8px;
          color: var(--black);
          text-decoration: none;
        }

        .edit-btn {
          margin-left: auto;
          padding: 8px 16px;
          background: var(--gray-100);
          border-radius: 8px;
          color: var(--black);
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .loading {
          text-align: center;
          padding: 48px;
          color: var(--gray-500);
        }

        .error-state {
          text-align: center;
          padding: 48px;
          color: var(--gray-500);
        }

        .section {
          margin-bottom: 24px;
        }

        .contact-card {
          display: flex;
          gap: 16px;
          padding: 20px;
          background: var(--gray-50);
          border-radius: 12px;
        }

        .contact-avatar {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--black);
          color: var(--white);
          border-radius: 50%;
          font-size: 24px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .contact-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-row {
          font-size: 14px;
          color: var(--gray-600);
        }

        .detail-row.comment {
          font-style: italic;
          color: var(--gray-500);
        }

        .stats-row {
          display: flex;
          gap: 12px;
        }

        .stat {
          flex: 1;
          padding: 16px;
          background: var(--white);
          border: 1px solid var(--gray-200);
          border-radius: 12px;
          text-align: center;
        }

        .stat-value {
          display: block;
          font-size: 20px;
          font-weight: 700;
          color: var(--black);
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-400);
          margin-bottom: 12px;
        }

        .empty-text {
          color: var(--gray-500);
          font-size: 14px;
          text-align: center;
          padding: 24px;
        }

        .movement-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--gray-200);
          border-radius: 12px;
          overflow: hidden;
        }

        .movement-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: var(--white);
        }

        .movement-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .movement-type {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-500);
        }

        .movement-service {
          font-size: 14px;
          font-weight: 500;
          color: var(--black);
        }

        .movement-amount {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }

        .amount {
          font-size: 15px;
          font-weight: 700;
          color: var(--black);
          font-variant-numeric: tabular-nums;
        }

        .movement-date {
          font-size: 11px;
          color: var(--gray-400);
        }
      `}</style>
    </div>
  );
}