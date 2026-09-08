'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppSheet } from './AppSheet';
import { ContactForm } from './ContactForm';
import type { Contact } from '@/types';

interface ContactFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string;
  onSuccess: (contact: { id: string; full_name: string }) => void;
}

export function ContactFormSheet({ open, onOpenChange, contactId, onSuccess }: ContactFormSheetProps) {
  const isEdit = Boolean(contactId);
  const [initialData, setInitialData] = useState<Partial<Contact> | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !contactId) {
      setInitialData(undefined);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    supabase
      .from('contacts')
      .select('id, full_name, ci, phone, comment')
      .eq('id', contactId)
      .single()
      .then(({ data }) => {
        setInitialData(data ?? undefined);
        setLoading(false);
      });
  }, [open, contactId]);

  const handleSuccess = (contact: { id: string; full_name: string }) => {
    onSuccess(contact);
    onOpenChange(false);
  };

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Editar Contacto' : 'Nuevo Contacto'}
    >
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Cargando...
        </div>
      ) : (
        <ContactForm
          hideHeader
          initialData={
            initialData
              ? {
                  full_name: initialData.full_name ?? '',
                  ci: initialData.ci ?? '',
                  phone: initialData.phone ?? '',
                  comment: initialData.comment ?? '',
                }
              : undefined
          }
          contactId={contactId}
          onCancel={() => onOpenChange(false)}
          onSuccess={handleSuccess}
        />
      )}
    </AppSheet>
  );
}
