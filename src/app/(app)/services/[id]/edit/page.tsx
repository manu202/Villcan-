'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Toggle } from '@/components/Toggle';
import { useBranch } from '@/contexts/BranchContext';

export default function ServiceEditPage() {
  const params = useParams();
  const router = useRouter();
  const { currentBranch } = useBranch();
  const serviceId = params.id as string;

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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    async function fetchService() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, cost, description, image_url, category, is_available, branch_id')
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
      setIsGlobal(data.branch_id === null);
      setLoading(false);
    }

    fetchService();
  }, [serviceId]);

  async function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadingImage(true);

    const supabase = createClient();
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from('service-images').upload(path, file);

    if (uploadErr) {
      setUploadingImage(false);
      setUploadError('No se pudo subir la imagen. Intenta de nuevo o pegá una URL.');
      console.error('ServiceEditPage image upload error:', uploadErr);
      return;
    }

    const { data } = supabase.storage.from('service-images').getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploadingImage(false);
  }

  async function handleSubmit(e: React.FormEvent) {
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
          <label htmlFor="imageFile">Imagen</label>
          {imageUrl && (
            <img src={imageUrl} alt="Vista previa" className="image-preview" />
          )}
          <input
            id="imageFile"
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            disabled={uploadingImage}
          />
          {uploadingImage && <p className="upload-status">Subiendo imagen...</p>}
          {uploadError && <p className="error">{uploadError}</p>}
          <input
            id="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="input-url-fallback"
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

        <div className="field toggle-row">
          <span className="toggle-row-label">Global</span>
          <Toggle
            checked={isGlobal}
            onChange={setIsGlobal}
            label="Servicio global (todas las sucursales)"
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <Link href={`/services/${serviceId}`} className="cancel-btn">
            Cancelar
          </Link>
          <button type="submit" className="submit-btn" disabled={submitting || uploadingImage}>
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

        .image-preview {
          display: block;
          width: 96px;
          height: 96px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--border);
        }

        .input-url-fallback {
          margin-top: 4px;
        }

        .upload-status {
          font-size: 13px;
          color: var(--text-secondary);
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