'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface ContactFormData {
  full_name: string;
  ci: string;
  phone: string;
  comment: string;
}

export default function EditContactPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  const [form, setForm] = useState<ContactFormData>({
    full_name: '',
    ci: '',
    phone: '',
    comment: '',
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!contactId) return;

    const fetchContact = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, ci, phone, comment')
        .eq('id', contactId)
        .single();

      if (error || !data) {
        setError('Contacto no encontrado');
        setLoading(false);
        return;
      }

      setForm({
        full_name: data.full_name || '',
        ci: data.ci || '',
        phone: data.phone || '',
        comment: data.comment || '',
      });
      setLoading(false);
    };

    fetchContact();
  }, [contactId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.full_name.trim()) {
      setError('Nombre es requerido');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          full_name: form.full_name.trim(),
          ci: form.ci.trim() || null,
          phone: form.phone.trim() || null,
          comment: form.comment.trim() || null,
        })
        .eq('id', contactId);

      if (updateError) throw updateError;

      setIsSubmitting(false);
      router.push(`/contacts/${contactId}`);
    } catch (err) {
      setIsSubmitting(false);
      setError('Error al guardar. Intenta de nuevo.');
      console.error('EditContactPage submit error:', err);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  if (error && !form.full_name) {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <Link href={`/contacts/${contactId}`} className="back-btn">←</Link>
          <h1 className="page-title">Editar Contacto</h1>
        </header>
        <div className="error-state">{error}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header flex-header">
        <Link href={`/contacts/${contactId}`} className="back-btn">←</Link>
        <h1 className="page-title">Editar Contacto</h1>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="section">
          <label className="label">Nombre *</label>
          <input
            type="text"
            name="full_name"
            value={form.full_name}
            onChange={handleChange}
            placeholder="Nombre completo"
            className="input"
            autoFocus
          />
        </section>

        <section className="section">
          <label className="label">Cédula de Identidad</label>
          <input
            type="text"
            name="ci"
            value={form.ci}
            onChange={handleChange}
            placeholder="1234567"
            className="input"
            inputMode="numeric"
          />
        </section>

        <section className="section">
          <label className="label">Teléfono</label>
          <input
            type="tel"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="595 984 123456"
            className="input"
          />
        </section>

        <section className="section">
          <label className="label">Comentario</label>
          <input
            type="text"
            name="comment"
            value={form.comment}
            onChange={handleChange}
            placeholder="Nota opcional"
            className="input"
          />
        </section>

        {error && <p className="error">{error}</p>}

        <section className="section">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-full"
          >
            {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </section>

        <section className="section">
          <Link href={`/contacts/${contactId}`} className="btn-cancel">
            Cancelar
          </Link>
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

        .error-state {
          text-align: center;
          padding: 48px;
          color: var(--gray-500);
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

        .input:focus {
          border-color: var(--black);
          outline: none;
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
          gap: 8px;
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

        .btn-cancel {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          background: var(--gray-100);
          color: var(--black);
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          min-height: 48px;
          width: 100%;
          text-decoration: none;
          text-align: center;
        }
      `}</style>
    </div>
  );
}