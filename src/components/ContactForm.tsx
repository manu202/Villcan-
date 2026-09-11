'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logClientError } from '@/lib/errorLogging';
import { useToast } from '@/contexts/ToastContext';
import { useBranch } from '@/contexts/BranchContext';

interface ContactFormData {
  full_name: string;
  ci: string;
  phone: string;
  comment: string;
}

interface ContactFormProps {
  initialData?: Partial<ContactFormData>;
  contactId?: string;
  hideHeader?: boolean;
  onCancel?: () => void;
  onSuccess?: (contact: { id: string; full_name: string }) => void;
}

export function ContactForm({ initialData, contactId, hideHeader, onCancel, onSuccess }: ContactFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { currentBranch } = useBranch();
  const handleBack = onCancel ?? (() => router.back());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<ContactFormData>({
    full_name: initialData?.full_name ?? '',
    ci: initialData?.ci ?? '',
    phone: initialData?.phone ?? '',
    comment: initialData?.comment ?? '',
  });
  const [error, setError] = useState('');

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
      const payload = {
        full_name: form.full_name.trim(),
        ci: form.ci.trim() || null,
        phone: form.phone.trim() || null,
        comment: form.comment.trim() || null,
      };

      if (contactId) {
        // UPDATE: branch_id is NOT included — the RLS WITH CHECK already prevents
        // moving a contact to a different branch.
        const { error } = await supabase.from('contacts').update(payload).eq('id', contactId);
        if (error) throw error;
        setIsSubmitting(false);
        if (onSuccess) {
          onSuccess({ id: contactId, full_name: payload.full_name });
        } else {
          showToast('Contacto actualizado', 'success');
          router.push('/contacts');
        }
      } else {
        // INSERT: branch_id is required by the new RLS INSERT policy.
        if (!currentBranch) {
          setIsSubmitting(false);
          setError('Seleccioná una sucursal antes de crear un contacto.');
          return;
        }
        const { data, error } = await supabase
          .from('contacts')
          .insert({ ...payload, branch_id: currentBranch.id })
          .select()
          .single();
        if (error) throw error;
        setIsSubmitting(false);
        if (onSuccess && data) {
          onSuccess({ id: data.id, full_name: data.full_name });
        } else {
          showToast('Contacto creado', 'success');
          router.push('/contacts');
        }
      }
    } catch (err) {
      setIsSubmitting(false);
      setError('Error al guardar. Intenta de nuevo.');
      void logClientError({
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack ?? null : null,
      });
    }
  };

  return (
    <div className="page">
      {!hideHeader && (
        <header className="page-header flex-header">
          <button onClick={handleBack} className="back-btn">←</button>
          <h1 className="page-title">{contactId ? 'Editar Contacto' : 'Nuevo Contacto'}</h1>
        </header>
      )}

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
            {isSubmitting ? 'Guardando...' : 'Guardar Contacto'}
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
          background: var(--surface-elevated);
          border-radius: 8px;
          color: var(--text-primary);
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
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 16px;
        }

        .input:focus {
          border-color: var(--accent);
          outline: none;
        }

        .error {
          color: var(--text-secondary);
          font-size: 14px;
          margin-bottom: 16px;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          background: var(--accent);
          color: var(--accent-foreground);
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