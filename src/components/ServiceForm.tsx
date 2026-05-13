'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface ServiceFormData {
  name: string;
  price: string;
}

interface ServiceFormProps {
  onCancel?: () => void;
  onSuccess?: (service: { id: string; name: string; price: number }) => void;
}

export function ServiceForm({ onCancel, onSuccess }: ServiceFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<ServiceFormData>({
    name: '',
    price: '',
  });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Nombre del servicio es requerido');
      return;
    }

    const priceNum = parseGuaranies(form.price);
    if (priceNum <= 0) {
      setError('Precio debe ser mayor a 0');
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('services')
      .insert({
        name: form.name.trim(),
        price: parseGuaranies(form.price),
        is_active: true,
      })
      .select()
      .single();

    setIsSubmitting(false);

    if (error) {
      setError('Error al guardar. Intenta de nuevo.');
      console.error('ServiceForm submit error:', error);
      return;
    }

    if (onSuccess && data) {
      onSuccess({ id: data.id, name: data.name, price: data.price });
    } else {
      router.push('/services');
    }
  };

  return (
    <div className="page">
      <header className="page-header flex-header">
        {onCancel && (
          <button onClick={onCancel} className="back-btn">←</button>
        )}
        <h1 className="page-title">Nuevo Servicio</h1>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="section">
          <label className="label">Nombre *</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Corte clásico"
            className="input"
            autoFocus
          />
        </section>

        <section className="section">
          <label className="label">Precio (G) *</label>
          <input
            type="text"
            name="price"
            value={form.price}
            onChange={handleChange}
            placeholder="35000"
            className="input input-price"
            inputMode="numeric"
          />
        </section>

        {error && <p className="error">{error}</p>}

        <section className="section">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-full"
          >
            {isSubmitting ? 'Guardando...' : 'Guardar Servicio'}
          </button>
        </section>
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
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .section {
          margin-bottom: 20px;
        }

        .label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-500);
          margin-bottom: 8px;
        }

        .input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid var(--gray-300);
          border-radius: 8px;
          font-size: 16px;
        }

        .input-price {
          font-size: 24px;
          font-weight: 700;
          text-align: center;
        }

        .error {
          color: var(--gray-600);
          font-size: 14px;
          margin-bottom: 16px;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 14px 24px;
          background: var(--black);
          color: var(--white);
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          min-height: 48px;
          width: 100%;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}