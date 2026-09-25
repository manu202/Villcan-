'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getCashClosingById } from '@/lib/data/closings';
import { formatDate, formatTime } from '@/lib/utils';
import { ClosingMethodBreakdown, type ClosingMethodBreakdownData } from '../ClosingMethodBreakdown';

interface ClosingDetail extends ClosingMethodBreakdownData {
  id: string;
  closed_at: string;
  branch: { name: string } | null;
  closed_by_profile: { full_name: string } | null;
}

export default function ClosingDetailPage() {
  const params = useParams();
  const closingId = params.id as string;

  const [closing, setClosing] = useState<ClosingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!closingId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      const { data, error: fetchError } = await getCashClosingById(closingId);
      if (cancelled) return;
      if (fetchError || !data) {
        setError(true);
      } else {
        setClosing(data as unknown as ClosingDetail);
      }
      setLoading(false);
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [closingId]);

  if (loading) {
    return (
      <div className="page">
        <p className="page-subtitle">Cargando...</p>
      </div>
    );
  }

  if (error || !closing) {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <Link href="/closings" className="back-btn">←</Link>
          <h1 className="page-title">Cierre</h1>
        </header>
        <p className="page-subtitle">Cierre no encontrado</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header flex-header">
        <Link href="/closings" className="back-btn">←</Link>
        <h1 className="page-title">Cierre de caja</h1>
      </header>

      <div className="detail-card">
        <div className="detail-card-body">
          <div className="closing-date">
            {formatDate(closing.closed_at)} {formatTime(closing.closed_at)}
          </div>
          <div className="closing-meta-row">
            <span className="closing-branch">{closing.branch?.name}</span>
            <span className="closing-closed-by">{closing.closed_by_profile?.full_name}</span>
          </div>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-label">Desglose por método</div>
        <div className="detail-card-body">
          <ClosingMethodBreakdown closing={closing} />
        </div>
      </div>

      <style>{`
        .page { max-width: 480px; margin: 0 auto; }

        .flex-header { display: flex; align-items: center; gap: 12px; }
        .back-btn {
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          background: var(--refresh-surface-glass, var(--surface-elevated));
          border: var(--refresh-border-hard, none);
          border-radius: var(--refresh-radius-control, 8px);
          color: var(--refresh-ink, var(--text-primary));
          text-decoration: none;
          flex-shrink: 0;
        }

        .page-title {
          font-family: var(--refresh-font-display, inherit);
          font-size: 22px;
          font-weight: 700;
          color: var(--refresh-ink, var(--text-primary));
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          margin-top: 4px;
        }

        .detail-card {
          background: var(--refresh-surface-glass, var(--surface));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: var(--refresh-border-hard, 1px solid var(--border));
          border-radius: var(--refresh-radius-card, 12px);
          overflow: hidden;
          margin-bottom: 12px;
        }
        .detail-card-label {
          padding: 12px 16px 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }
        .detail-card-body { padding: 12px 16px 16px; }

        .closing-date {
          font-size: 16px;
          font-weight: 700;
          color: var(--refresh-ink, var(--text-primary));
        }
        .closing-meta-row {
          display: flex;
          justify-content: space-between;
          margin-top: 4px;
          font-size: 13px;
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }
        .closing-branch { font-weight: 600; }
      `}</style>
    </div>
  );
}
