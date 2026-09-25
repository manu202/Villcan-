'use client';

import { useEffect, useState } from 'react';
import { listContacts, listLastVisitsForContacts } from '@/lib/data/contacts';
import type { Contact } from '@/types';
import { Spinner } from '@/components/Spinner';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ContactCard } from '@/components/ContactCard';
import { ContactDetailSheet } from '@/components/ContactDetailSheet';
import { ContactFormSheet } from '@/components/ContactFormSheet';

type SortBy = 'name' | 'date';

const PAGE_SIZE = 30;

type ContactWithVisit = Contact & { lastVisit?: string | null };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactWithVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Sheet state
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editContactId, setEditContactId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const loadContacts = async (reset = false) => {
      const currentPage = reset ? 0 : page;
      setLoading(currentPage === 0);
      setError(false);

      const { data, error: fetchError } = await listContacts({
        search,
        sortBy,
        page: currentPage,
        pageSize: PAGE_SIZE,
      });

      if (fetchError) {
        setError(true);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const newContacts = (data ?? []) as Contact[];
      setHasMore(newContacts.length === PAGE_SIZE);

      // Batched last-visit lookup — ONE query, not N+1
      const ids = newContacts.map((c) => c.id);
      let lastVisitMap = new Map<string, string>();

      if (ids.length > 0) {
        const { data: visitRows } = await listLastVisitsForContacts(ids);

        for (const row of (visitRows ?? []) as { contact_id: string; created_at: string }[]) {
          const existing = lastVisitMap.get(row.contact_id);
          if (!existing || row.created_at > existing) {
            lastVisitMap.set(row.contact_id, row.created_at);
          }
        }
      }

      const enriched: ContactWithVisit[] = newContacts.map((c) => ({
        ...c,
        lastVisit: lastVisitMap.get(c.id) ?? null,
      }));

      if (reset || currentPage === 0) {
        setContacts(enriched);
      } else {
        setContacts((prev) => [...prev, ...enriched]);
      }

      setLoading(false);
      setLoadingMore(false);
    };

    loadContacts(page === 0);
  }, [search, sortBy, page]);

  const handleCardClick = (id: string) => {
    setSelectedContactId(id);
    setDetailOpen(true);
  };

  const handleNewContact = () => {
    setEditContactId(undefined);
    setFormOpen(true);
  };

  const handleEdit = (id: string) => {
    setDetailOpen(false);
    setEditContactId(id);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    setPage(0);
    setSearch('');
  };

  const handleSortChange = (newSort: SortBy) => {
    if (newSort !== sortBy) {
      setSortBy(newSort);
      setPage(0);
    }
  };

  const toggleSort = () => handleSortChange(sortBy === 'name' ? 'date' : 'name');

  return (
    <div className="page">
      <header className="cp-header">
        <div>
          <h1 className="page-title">Contactos</h1>
          <div className="cp-subtitle-row">
            {!loading && (
              <>
                <p className="page-subtitle">{contacts.length} clientes</p>
                <button onClick={toggleSort} className="cp-sort-btn">
                  {sortBy === 'name' ? 'A-Z' : 'Recientes'}
                </button>
              </>
            )}
          </div>
        </div>
        <button onClick={handleNewContact} className="cp-btn-new">+ Nuevo</button>
      </header>

      <section className="section">
        <input
          type="text"
          placeholder="Buscar contacto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="cp-search"
        />
      </section>

      <section className="section">
        {loading ? (
          <div className="cp-spinner-wrap">
            <Spinner size={36} color="black" />
          </div>
        ) : error ? (
          <ErrorState onRetry={() => setPage(0)} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin contactos"
            message="No hay contactos registrados"
            actionLabel="Agregar contacto"
            onAction={handleNewContact}
          />
        ) : (
          <>
            <ul className="cp-list">
              {contacts.map((c) => (
                <ContactCard key={c.id} contact={c} onClick={handleCardClick} />
              ))}
            </ul>
            {hasMore && (
              <button
                onClick={() => { if (!loadingMore && hasMore) { setLoadingMore(true); setPage((p) => p + 1); } }}
                disabled={loadingMore}
                className="cp-btn-more"
              >
                {loadingMore ? 'Cargando...' : 'Ver más'}
              </button>
            )}
          </>
        )}
      </section>

      {selectedContactId && (
        <ContactDetailSheet
          contactId={selectedContactId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onEdit={handleEdit}
        />
      )}

      <ContactFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        contactId={editContactId}
        onSuccess={handleFormSuccess}
      />

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
          background: var(--refresh-bg, transparent);
        }

        .cp-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 16px 16px 8px;
          position: sticky;
          top: 0;
          background: var(--refresh-bg, var(--surface));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          z-index: 10;
          border-bottom: var(--refresh-border-hard, 1px solid var(--border));
        }

        .page-title {
          font-family: var(--refresh-font-display, inherit);
          color: var(--refresh-ink, var(--text-primary));
        }

        .cp-subtitle-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 4px;
          min-height: 24px;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          margin: 0;
        }

        .cp-sort-btn {
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--refresh-radius-control, 6px);
          border: var(--refresh-border-hard, 1px solid var(--border));
          background: var(--refresh-surface-glass, var(--surface));
          color: var(--refresh-ink-secondary, var(--text-secondary));
          cursor: pointer;
          font-family: var(--refresh-font-sans, inherit);
        }

        .cp-btn-new {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          background: var(--refresh-accent, var(--accent));
          color: #fff;
          border: var(--refresh-border-hard, none);
          box-shadow: var(--refresh-shadow-hard-sm, none);
          border-radius: var(--refresh-radius-control, 8px);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
          min-width: 44px;
          font-family: var(--refresh-font-sans, inherit);
        }

        .cp-search {
          width: 100%;
          padding: 12px 16px;
          border: var(--refresh-border-hard, 1px solid var(--border));
          border-radius: var(--refresh-radius-control, 8px);
          font-size: 16px;
          background: var(--refresh-surface-glass, var(--surface));
          color: var(--refresh-ink, var(--text-primary));
          box-sizing: border-box;
        }

        .cp-spinner-wrap {
          display: flex;
          justify-content: center;
          padding: 48px;
        }

        /* Cards already carry their own border/radius/shadow (T3) — a
           gap between items replaces the old shared-background hairline
           divider, which would otherwise double up against each card's
           own border. */
        .cp-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .cp-btn-more {
          display: block;
          width: 100%;
          margin-top: 16px;
          padding: 12px 16px;
          border: var(--refresh-border-hard, 1px solid var(--border));
          border-radius: var(--refresh-radius-control, 8px);
          background: var(--refresh-surface-glass, var(--surface));
          font-size: 14px;
          font-weight: 500;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          cursor: pointer;
          font-family: var(--refresh-font-sans, inherit);
        }

        .cp-btn-more:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
