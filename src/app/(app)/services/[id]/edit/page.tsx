'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Toggle } from '@/components/Toggle';

export default function ServiceEditPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    async function fetchService() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, cost, description, image_url, category, is_available')
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
      setDescription(data.description ?? '');
      setImageUrl(data.image_url ?? '');
      setCategory(data.category ?? '');
      setIsAvailable(data.is_available ?? true);
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
      .update({
        name,
        price: parseInt(price, 10),
        cost: cost ? parseInt(cost, 10) : 0,
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        category: category.trim() || null,
        is_available: isAvailable,
      })
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

        <div className="field">
          <label htmlFor="description">Descripción</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Se muestra en la tienda pública debajo del nombre"
            rows={3}
          />
        </div>

        <div className="field">
          <label htmlFor="imageUrl">URL de la imagen</label>
          <input
            id="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="field">
          <label htmlFor="category">Categoría</label>
          <input
            id="category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Cortes, Bebidas, etc."
          />
        </div>

        <div className="field toggle-row">
          <span className="toggle-row-label">Disponible</span>
          <Toggle
            checked={isAvailable}
            onChange={setIsAvailable}
            label="Disponible en la tienda pública"
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
          background: var(--surface-elevated);
          border-radius: 8px;
          color: var(--text-primary);
          text-decoration: none;
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .loading {
          text-align: center;
          padding: 48px;
          color: var(--text-secondary);
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
          color: var(--text-primary);
        }

        .field input {
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
        }

        .field input:focus,
        .field textarea:focus {
          outline: none;
          border-color: var(--accent);
        }

        .field textarea {
          padding: 12px 16px;
          font-size: 16px;
          font-family: inherit;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
          resize: vertical;
        }

        .toggle-row {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }

        .toggle-row-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
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
          background: var(--surface-elevated);
          color: var(--text-primary);
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          text-decoration: none;
        }

        .submit-btn {
          flex: 2;
          padding: 14px;
          background: var(--accent);
          color: var(--accent-foreground);
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