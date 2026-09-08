'use client';

import { MessageCircle } from 'lucide-react';
import type { Contact } from '@/types';
import { formatRelativeDate } from '@/lib/utils';

interface ContactCardProps {
  contact: Contact & { lastVisit?: string | null };
  onClick: (id: string) => void;
}

export function ContactCard({ contact, onClick }: ContactCardProps) {
  const initial = contact.full_name.charAt(0).toUpperCase();
  const phoneClean = contact.phone?.replace(/\D/g, '') ?? null;
  const waUrl = phoneClean ? `https://wa.me/${phoneClean}` : null;

  return (
    <li
      className="contact-card"
      data-testid={`contact-card-${contact.id}`}
      onClick={() => onClick(contact.id)}
    >
      <div className="contact-card-avatar" data-testid="contact-avatar">
        {initial}
      </div>

      <div className="contact-card-body">
        <div className="contact-card-name-row">
          <span className="contact-card-name">{contact.full_name}</span>
          {contact.comment && (
            <span
              className="contact-card-note-dot"
              data-testid="contact-card-note-indicator"
              title="Tiene notas"
            />
          )}
        </div>
        {contact.ci && (
          <span className="contact-card-ci">CI {contact.ci}</span>
        )}
        <span className="contact-card-visit">
          {contact.lastVisit ? formatRelativeDate(contact.lastVisit) : 'Sin visitas'}
        </span>
      </div>

      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          className="contact-card-wa-btn"
          onClick={(e) => e.stopPropagation()}
        >
          <MessageCircle size={20} aria-hidden="true" />
        </a>
      )}

      <style>{`
        .contact-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: var(--surface);
          cursor: pointer;
          list-style: none;
          transition: background 0.1s;
        }
        .contact-card:active {
          background: var(--accent-subtle);
        }
        .contact-card-avatar {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--accent);
          color: var(--accent-foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
        }
        .contact-card-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .contact-card-name-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .contact-card-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .contact-card-note-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }
        .contact-card-ci {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .contact-card-visit {
          font-size: 11px;
          color: var(--text-secondary);
        }
        .contact-card-wa-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #25D366;
          color: #fff;
          flex-shrink: 0;
          text-decoration: none;
          transition: opacity 0.1s;
        }
        .contact-card-wa-btn:active {
          opacity: 0.8;
        }
      `}</style>
    </li>
  );
}
