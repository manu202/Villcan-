'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/contexts/ToastContext';
import { Toggle } from '@/components/Toggle';

interface ServiceFormData {
  name: string;
  price: string;
  cost: string;
  isGlobal: boolean;
  description: string;
  imageUrl: string;
  category: string;
  isAvailable: boolean;
}

interface ServiceFormProps {
  onCancel?: () => void;
  onSuccess?: (service: { id: string; name: string; price: number }) => void;
}

export function ServiceForm({ onCancel, onSuccess }: ServiceFormProps) {
  const router = useRouter();
  const handleBack = onCancel ?? (() => router.back());
  const { currentBranch, initialized } = useBranch();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<ServiceFormData>({
    name: '',
    price: '',
    cost: '',
    isGlobal: false,
    description: '',
    imageUrl: '',
    category: '',
    isAvailable: true,
  });
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, isGlobal: e.target.checked }));
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    setUploadingImage(true);

    const supabase = createClient();
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from('service-images').upload(path, file);

    if (uploadErr) {
      setUploadingImage(false);
      setUploadError('No se pudo subir la imagen. Intenta de nuevo o pegá una URL.');
      console.error('ServiceForm image upload error:', uploadErr);
      return;
    }

    const { data } = supabase.storage.from('service-images').getPublicUrl(path);
    setForm(prev => ({ ...prev, imageUrl: data.publicUrl }));
    setUploadingImage(false);
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

    // Wait for branches to be initialized
    if (!initialized) {
      setError('Cargando sucursales...');
      setIsSubmitting(false);
      return;
    }

    const supabase = createClient();

    // If isGlobal is true, branch_id = null (global service)
    // Otherwise, use current branch (required - error if no branch selected)
    const branchId = form.isGlobal ? null : currentBranch?.id;

    if (!form.isGlobal && !currentBranch) {
      setError('Debes seleccionar una sucursal para crear servicios');
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from('services')
      .insert({
        name: form.name.trim(),
        price: parseGuaranies(form.price),
        cost: form.cost ? parseGuaranies(form.cost) : 0,
        is_active: true,
        branch_id: branchId,
        description: form.description.trim() || null,
        image_url: form.imageUrl.trim() || null,
        category: form.category.trim() || null,
        is_available: form.isAvailable,
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
      showToast('Servicio creado', 'success');
      router.push('/services');
    }
  };

  return (
    <div className="page">
      <header className="page-header flex-header">
        <button onClick={handleBack} className="back-btn">←</button>
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

        <section className="section">
          <label className="label">Costo (G)</label>
          <input
            type="text"
            name="cost"
            value={form.cost}
            onChange={handleChange}
            placeholder="0"
            className="input input-price"
            inputMode="numeric"
          />
        </section>

        <section className="section">
          <label className="label">Descripción</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Se muestra en la tienda pública debajo del nombre"
            className="input textarea"
            rows={3}
          />
        </section>

        <section className="section">
          <label className="label">Imagen</label>
          {form.imageUrl && (
            <img src={form.imageUrl} alt="Vista previa" className="image-preview" />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            className="input"
            disabled={uploadingImage}
            aria-label="Subir imagen"
          />
          {uploadingImage && <p className="upload-status">Subiendo imagen...</p>}
          {uploadError && <p className="error">{uploadError}</p>}
          <input
            type="url"
            name="imageUrl"
            value={form.imageUrl}
            onChange={handleChange}
            placeholder="https://..."
            className="input input-url-fallback"
          />
        </section>

        <section className="section">
          <label className="label">Categoría</label>
          <input
            type="text"
            name="category"
            value={form.category}
            onChange={handleChange}
            placeholder="Cortes, Bebidas, etc."
            className="input"
          />
        </section>

        <section className="section">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.isGlobal}
              onChange={handleCheckboxChange}
            />
            <span>Servicio global (todas las sucursales)</span>
          </label>
        </section>

        <section className="section toggle-row">
          <span className="label toggle-row-label">Disponible</span>
          <Toggle
            checked={form.isAvailable}
            onChange={(checked) => setForm(prev => ({ ...prev, isAvailable: checked }))}
            label="Disponible en la tienda pública"
          />
        </section>

        {error && <p className="error">{error}</p>}

        <section className="section">
          <button
            type="submit"
            disabled={isSubmitting || uploadingImage}
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

        .input-price {
          font-size: 24px;
          font-weight: 700;
          text-align: center;
        }

        .error {
          color: var(--text-secondary);
          font-size: 14px;
          margin-bottom: 16px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 20px;
          height: 20px;
          cursor: pointer;
        }

        .textarea {
          resize: vertical;
          font-family: inherit;
        }

        .image-preview {
          display: block;
          width: 96px;
          height: 96px;
          object-fit: cover;
          border-radius: 8px;
          margin-bottom: 10px;
          border: 1px solid var(--border);
        }

        .input-url-fallback {
          margin-top: 8px;
        }

        .upload-status {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 8px;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .toggle-row-label {
          margin-bottom: 0;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
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