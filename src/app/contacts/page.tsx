'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Contact } from '@/types';

type SortBy = 'name' | 'date';

const PAGE_SIZE = 30;

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const loadContacts = async (reset = false) => {
      const supabase = createClient();
      const currentPage = reset ? 0 : page;

      let query = supabase
        .from('contacts')
        .select('id, full_name, ci, phone, comment', { count: 'exact' });

      if (search.length >= 2) {
        query = query.or(`full_name.ilike.%${search}%,ci.ilike.%${search}%`);
      }

      query = query.order(sortBy === 'name' ? 'full_name' : 'created_at', {
        ascending: sortBy === 'name',
      });

      query = query.range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      const { data } = await query;

      if (data) {
        const newContacts = data as Contact[];
        if (reset || currentPage === 0) {
          setContacts(newContacts);
        } else {
          setContacts((prev) => [...prev, ...newContacts]);
        }
        setHasMore(newContacts.length === PAGE_SIZE);
      }
      setLoading(false);
      setLoadingMore(false);
    };

    loadContacts(page === 0);
  }, [search, sortBy, page]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      setPage((prev) => prev + 1);
    }
  };

  const handleSortChange = (newSort: SortBy) => {
    if (newSort !== sortBy) {
      setSortBy(newSort);
      setPage(0);
      setLoading(true);
    }
  };

  const toggleSort = () => {
    handleSortChange(sortBy === 'name' ? 'date' : 'name');
  };

  return (
    <div className="page">
      <header className="page-header flex-header">
        <div>
          <h1 className="page-title">Contactos</h1>
          <div className="page-subtitle-row">
            {loading ? (
              <p className="page-subtitle">...</p>
            ) : (
              <>
                <p className="page-subtitle">{contacts.length} clientes</p>
                <button onClick={toggleSort} className="sort-btn">
                  {sortBy === 'name' ? 'A-Z' : 'Recientes'}
                </button>
              </>
            )}
          </div>
        </div>
        <Link href="/contacts/new" className="btn-add">+Nuevo</Link>
      </header>

      <section className="section">
        <input
          type="text"
          placeholder="Buscar contacto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </section>

      <section className="section">
        {loading ? (
          <p className="page-subtitle">Cargando...</p>
        ) : contacts.length === 0 ? (
          <div className="empty-state">
            <p>No hay contactos registrados</p>
            <Link href="/contacts/new" className="btn-secondary">
              Agregar primer contacto
            </Link>
          </div>
        ) : (
          <>
            <ul className="contact-list">
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/contacts/${c.id}`} className="contact-item">
                    <div className="contact-avatar">
                      {c.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="contact-info">
                      <span className="contact-name">{c.full_name}</span>
                      <span className="contact-details">
                        {c.ci && `CI ${c.ci}`}
                        {c.ci && c.phone && ' • '}
                        {c.phone && c.phone}
                      </span>
                    </div>
                    <span className="contact-action">›</span>
                  </Link>
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn-load-more"
              >
                {loadingMore ? 'Cargando...' : 'Ver más'}
              </button>
            )}
          </>
        )}
      </section>

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .flex-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .page-subtitle-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 4px;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--gray-500);
        }

        .sort-btn {
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid var(--gray-200);
          background: var(--white);
          color: var(--gray-700);
          cursor: pointer;
        }

        .sort-btn:active {
          background: var(--gray-50);
        }

        .btn-add {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          background: var(--black);
          color: var(--white);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          min-height: 44px;
          min-width: 44px;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid var(--gray-200);
          border-radius: 8px;
          font-size: 16px;
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--gray-500);
        }

        .empty-state p {
          margin-bottom: 16px;
        }

        .contact-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--gray-200);
          border-radius: 12px;
          overflow: hidden;
        }

        .contact-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: var(--white);
          text-decoration: none;
          color: inherit;
        }

        .contact-item:active {
          background: var(--gray-50);
        }

        .contact-avatar {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--black);
          color: var(--white);
          border-radius: 50%;
          font-size: 16px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .contact-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          min-width: 0;
        }

        .contact-name {
          font-size: 15px;
          font-weight: 500;
          color: var(--black);
        }

        .contact-details {
          font-size: 12px;
          color: var(--gray-500);
        }

        .contact-action {
          font-size: 24px;
          color: var(--gray-400);
          flex-shrink: 0;
        }

        .btn-load-more {
          display: block;
          width: 100%;
          margin-top: 16px;
          padding: 12px 16px;
          border: 1px solid var(--gray-200);
          border-radius: 8px;
          background: var(--white);
          font-size: 14px;
          font-weight: 500;
          color: var(--gray-700);
          cursor: pointer;
        }

        .btn-load-more:active {
          background: var(--gray-50);
        }

        .btn-load-more:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}