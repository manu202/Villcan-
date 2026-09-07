'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Toggle } from '@/components/Toggle';
import { useBranch } from '@/contexts/BranchContext';
import { Spinner } from '@/components/Spinner';

interface ServiceEditSheetProps {
  serviceId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ServiceEditSheet({ serviceId, onClose, onSaved }: ServiceEditSheetProps) {
  const { currentBranch } = useBranch();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isGlobal, setIsGlobal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, cost, description, image_url, category, is_available, branch_id')
        .eq('id', serviceId)
        .single();

      if (cancelled) return;

      if (error || !data) { setLoading(false); return; }

      setName(data.name);
      setPrice(data.price.toString());
      setCost(data.cost != null ? data.cost.toString() : '');
      setDescription(data.description ?? '');
      setImageUrl(data.image_url ?? '');
      setCategory(data.category ?? '');
      setIsAvailable(data.is_available ?? true);
      setIsGlobal(data.branch_id === null);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [serviceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const branchId = isGlobal ? null : (currentBranch?.id ?? null);

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
        branch_id: branchId,
      })
      .eq('id', serviceId);

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    onSaved();
    onClose();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
        <Spinner size={36} color="black" />
      </div>
    );
  }

  return (
    <form className="ses-form" onSubmit={handleSubmit}>
      <div className="ses-field">
        <label className="ses-label" htmlFor="ses-name">Nombre</label>
        <input
          id="ses-name"
          className="ses-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="ses-field">
        <label className="ses-label" htmlFor="ses-price">Precio (₲)</label>
        <input
          id="ses-price"
          className="ses-input"
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          min="0"
        />
      </div>

      <div className="ses-field">
        <label className="ses-label" htmlFor="ses-cost">Costo (₲)</label>
        <input
          id="ses-cost"
          className="ses-input"
          type="number"
          inputMode="numeric"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          min="0"
        />
      </div>

      <div className="ses-field">
        <label className="ses-label" htmlFor="ses-category">Categoría</label>
        <input
          id="ses-category"
          className="ses-input"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>

      <div className="ses-field">
        <label className="ses-label" htmlFor="ses-description">Descripción</label>
        <textarea
          id="ses-description"
          className="ses-input ses-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className="ses-toggle-row">
        <span className="ses-label">Disponible en el catálogo</span>
        <Toggle
          checked={isAvailable}
          onChange={setIsAvailable}
          label="Disponible en el catálogo"
        />
      </div>

      {error && <p className="ses-error">{error}</p>}

      <div className="ses-actions">
        <button type="button" className="ses-btn-cancel" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="ses-btn-save" disabled={submitting}>
          {submitting ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <style>{`
        .ses-form { display: flex; flex-direction: column; gap: 16px; }
        .ses-field { display: flex; flex-direction: column; gap: 6px; }
        .ses-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .ses-input {
          width: 100%; padding: 10px 12px;
          border: 1px solid var(--border); border-radius: 8px;
          font-size: 15px; background: var(--surface); color: var(--text-primary);
        }
        .ses-input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
        .ses-textarea { resize: vertical; min-height: 72px; }
        .ses-toggle-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 4px 0;
        }
        .ses-error { font-size: 13px; color: #ef4444; }
        .ses-actions { display: flex; gap: 10px; padding-top: 4px; }
        .ses-btn-cancel {
          flex: 1; padding: 12px; border: 1px solid var(--border);
          border-radius: 10px; font-size: 14px; font-weight: 600;
          background: var(--surface); color: var(--text-secondary); cursor: pointer;
        }
        .ses-btn-save {
          flex: 2; padding: 12px; border: none;
          border-radius: 10px; font-size: 14px; font-weight: 700;
          background: var(--accent); color: var(--accent-foreground); cursor: pointer;
        }
        .ses-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </form>
  );
}
