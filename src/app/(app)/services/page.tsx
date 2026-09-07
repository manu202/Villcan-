'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { ErrorState } from '@/components/ErrorState';
import { AppSheet } from '@/components/AppSheet';
import { ServiceCard } from '@/components/ServiceCard';
import { ServiceEditSheet } from '@/components/ServiceEditSheet';
import type { Service } from '@/types';

export default function ServicesPage() {
  const { currentBranch, initialized } = useBranch();
  const { settings } = useSettings();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const currentBranchRef = useRef(currentBranch);
  useEffect(() => { currentBranchRef.current = currentBranch; }, [currentBranch]);

  const loadServices = useCallback(async () => {
    const branch = currentBranchRef.current;
    setLoading(true);
    setError(false);
    const supabase = createClient();

    let query = supabase
      .from('services')
      .select('id, name, price, is_active, is_available, branch_id')
      .eq('is_active', true)
      .order('name');

    if (branch) {
      query = query.or(`branch_id.eq.${branch.id},branch_id.is.null`);
    } else {
      query = query.is('branch_id', null);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(true);
    } else if (data) {
      setServices(data as Service[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    loadServices();
  }, [initialized, loadServices, reloadToken]);

  const handleToggle = async (id: string, available: boolean) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_available: available } : s))
    );
    const supabase = createClient();
    await supabase.from('services').update({ is_available: available }).eq('id', id);
  };

  const handleServiceClick = (id: string) => {
    setSelectedServiceId(id);
  };

  return (
    <div className="page">
      <header className="page-header flex-header">
        <div>
          <h1 className="page-title">{settings.services_label}</h1>
          {!loading && !error && (
            <p className="page-subtitle">{services.length} {settings.services_label.toLowerCase()}</p>
          )}
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
              <ServiceCard
                key={s.id}
                service={s}
                onToggle={handleToggle}
                onClick={handleServiceClick}
              />
            ))}
          </ul>
        )}
      </section>

      <AppSheet
        open={selectedServiceId !== null}
        onOpenChange={(open) => { if (!open) setSelectedServiceId(null); }}
        title="Editar servicio"
      >
        {selectedServiceId && (
          <ServiceEditSheet
            serviceId={selectedServiceId}
            onClose={() => setSelectedServiceId(null)}
            onSaved={loadServices}
          />
        )}
      </AppSheet>

      <style>{`
        .page { max-width: 480px; margin: 0 auto; }

        .flex-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .btn-add {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          background: var(--accent);
          color: var(--accent-foreground);
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
          color: var(--text-secondary);
        }

        .empty-state p { margin-bottom: 16px; }

        .service-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 0;
        }
      `}</style>
    </div>
  );
}
