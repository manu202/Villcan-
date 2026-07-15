'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { formatGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { ErrorState } from '@/components/ErrorState';
import type { Service } from '@/types';

export default function ServicesPage() {
  const { currentBranch, initialized } = useBranch();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Use ref to always have current branch value inside async functions
  const currentBranchRef = useRef(currentBranch);
  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);

  useEffect(() => {
    if (!initialized) return;

    let cancelled = false;

    const loadServices = async () => {
      const branch = currentBranchRef.current;
      setLoading(true);
      setError(false);
      const supabase = createClient();

      // Show: services from current branch + global services (branch_id IS NULL)
      let query = supabase
        .from('services')
        .select('id, name, price, is_active, branch_id')
        .eq('is_active', true)
        .order('name');

      // Apply branch filter: current branch OR global (null)
      if (branch) {
        query = query.or(`branch_id.eq.${branch.id},branch_id.is.null`);
      } else {
        // No branch selected, only show global services
        query = query.is('branch_id', null);
      }

      const { data, error: fetchError } = await query;

      if (cancelled) return;

      if (fetchError) {
        setError(true);
      } else if (data) {
        setServices(data as Service[]);
      }
      setLoading(false);
    };
    loadServices();

    return () => {
      cancelled = true;
    };
  }, [initialized, reloadToken]);

  return (
    <div className="page">
      <header className="page-header flex-header">
        <div>
          <h1 className="page-title">Servicios</h1>
          {loading ? (
            <p className="page-subtitle">...</p>
          ) : !error ? (
            <p className="page-subtitle">{services.length} servicios</p>
          ) : null}
        </div>
        <Link href="/services/new" className="btn-add">+Nuevo</Link>
      </header>

      <section className="section">
        {loading ? (
          <p className="page-subtitle">Cargando...</p>
        ) : error ? (
          <ErrorState onRetry={() => setReloadToken((t) => t + 1)} />
        ) : services.length === 0 ? (
          <div className="empty-state">
            <p>No hay servicios registrados</p>
            <Link href="/services/new" className="btn-secondary">
              Agregar primer servicio
            </Link>
          </div>
        ) : (
          <ul className="service-list">
            {services.map((s) => (
              <li key={s.id}>
                <Link href={`/services/${s.id}`} className="service-item">
                  <div className="service-info">
                    <span className="service-name">{s.name}</span>
                  </div>
                  <div className="service-actions">
                    <span className="service-price">{formatGuaranies(s.price)}</span>
                    <span className="service-arrow">›</span>
                  </div>
                </Link>
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
          justify-content: space-between;
          align-items: flex-start;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--gray-500);
          margin-top: 4px;
        }

        .btn-add {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          background: var(--black);
          color: var(--white);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          min-height: 44px;
          min-width: 44px;
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--gray-500);
        }

        .empty-state p {
          margin-bottom: 16px;
        }

        .service-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--gray-200);
          border-radius: 12px;
          overflow: hidden;
        }

        .service-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: var(--white);
          text-decoration: none;
          color: inherit;
        }

        .service-item:active {
          background: var(--gray-50);
        }

        .service-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .service-name {
          font-size: 15px;
          font-weight: 500;
          color: var(--black);
        }

        .service-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .service-price {
          font-size: 15px;
          font-weight: 600;
          color: var(--black);
          font-variant-numeric: tabular-nums;
        }

        .service-arrow {
          font-size: 20px;
          color: var(--gray-400);
        }
      `}</style>
    </div>
  );
}