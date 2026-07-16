'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ServiceEditPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    async function fetchService() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, cost')
        .eq('id', serviceId)
        .single();

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setName(data.name);
      setPrice(data.price.toString());
      setCost(data.cost != null ? data.cost.toString() : '');
      setLoading(false);
    }

    fetchService();
  }, [serviceId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from('services')
      .update({ name, price: parseInt(price, 10), cost: cost ? parseInt(cost, 10) : 0 })
      .eq('id', serviceId);

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.push(`/services/${serviceId}`);
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header flex-header">
        <Link href={`/services/${serviceId}`} className="back-btn">←</Link>
        <h1 className="page-title">Editar servicio</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label htmlFor="name">Nombre</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="price">Precio (Gs)</label>
          <input
            id="price"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            min="0"
          />
        </div>

        <div className="field">
          <label htmlFor="cost">Costo (Gs)</label>
          <input
            id="cost"
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            min="0"
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <Link href={`/services/${serviceId}`} className="cancel-btn">
            Cancelar
          </Link>
          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .flex-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 32px;
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

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .loading {
          text-align: center;
          padding: 48px;
          color: var(--gray-500);
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field label {
          font-size: 14px;
          font-weight: 600;
          color: var(--black);
        }

        .field input {
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid var(--gray-200);
          border-radius: 8px;
          background: var(--white);
        }

        .field input:focus {
          outline: none;
          border-color: var(--black);
        }

        .error {
          color: #dc2626;
          font-size: 14px;
          padding: 12px;
          background: #fef2f2;
          border-radius: 8px;
        }

        .actions {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }

        .cancel-btn {
          flex: 1;
          padding: 14px;
          text-align: center;
          background: var(--gray-100);
          color: var(--black);
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          text-decoration: none;
        }

        .submit-btn {
          flex: 2;
          padding: 14px;
          background: var(--black);
          color: var(--white);
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}