'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ShoppingBag, X, Plus, Minus, MessageCircle, UtensilsCrossed,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { CheckoutForm } from '../CheckoutForm';
import { useStorefrontCart } from '../useStorefrontCart';
import { formatGuaranies } from '@/lib/utils';
import type { Branch, Service } from '@/types';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Work+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap';

interface GastronomyTemplateProps {
  branch: Branch;
  services: Service[];
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function groupByCategory(services: Service[]): [string, Service[]][] {
  const map = new Map<string, Service[]>();
  for (const s of services) {
    const key = s.category || 'Del menú';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return [...map.entries()];
}

export function GastronomyTemplate({ branch, services }: GastronomyTemplateProps) {
  const {
    cart, lines, total, itemCount, step,
    submitting, errorMessage, result, whatsappHref,
    addToCart, increment, decrement,
    goToCheckout, backToCatalog, handleSubmit,
  } = useStorefrontCart(branch, services);

  const [cartOpen, setCartOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [navDir, setNavDir] = useState<'next' | 'prev' | null>(null);
  const [exiting, setExiting] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; active: boolean; captured: boolean }>({ startX: 0, startY: 0, active: false, captured: false });
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categories = useMemo(() => groupByCategory(services), [services]);

  const selected = selectedIdx !== null ? services[selectedIdx] : null;
  const hasPrev = selectedIdx !== null && selectedIdx > 0;
  const hasNext = selectedIdx !== null && selectedIdx < services.length - 1;

  function navigate(nextIdx: number, direction: 'next' | 'prev') {
    if (exiting) return;
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    setNavDir(direction);
    setExiting(true);
    exitTimerRef.current = setTimeout(() => {
      setSelectedIdx(nextIdx);
      setExiting(false);
    }, 160);
  }

  const openSheet = (item: Service) => {
    setNavDir(null);
    setExiting(false);
    setSelectedIdx(services.findIndex(s => s.id === item.id));
  };
  const closeSheet = () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    setSelectedIdx(null);
    setExiting(false);
    setNavDir(null);
  };
  const goPrev = () => { if (selectedIdx !== null && hasPrev) navigate(selectedIdx - 1, 'prev'); };
  const goNext = () => { if (selectedIdx !== null && hasNext) navigate(selectedIdx + 1, 'next'); };

  const onSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, active: true, captured: false };
  };
  const onSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.captured) return;
    const dx = Math.abs(e.clientX - dragRef.current.startX);
    const dy = Math.abs(e.clientY - dragRef.current.startY);
    if (dx > 10 && dx > dy * 1.5) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current.captured = true;
    } else if (dy > 10) {
      dragRef.current.active = false;
    }
  };
  const onSheetPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) < 48) return;
    if (dx < 0) goNext();
    else goPrev();
  };
  const onSheetPointerCancel = () => { dragRef.current.active = false; };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected) {
        if (e.key === 'Escape') { closeSheet(); return; }
        if (e.key === 'ArrowRight') { goNext(); return; }
        if (e.key === 'ArrowLeft') { goPrev(); return; }
      }
      if (cartOpen && e.key === 'Escape') setCartOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cartOpen, selectedIdx]);

  useEffect(() => {
    document.body.style.overflow = cartOpen || selected ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen, selected]);

  // When the order is confirmed, go directly to WhatsApp
  useEffect(() => {
    if (step === 'success' && whatsappHref) {
      window.open(whatsappHref, '_blank', 'noreferrer');
    }
  }, [step, whatsappHref]);

  const sheetQty = selected ? (cart[selected.id] ?? 0) : 0;

  const handleSheetAdd = () => {
    if (!selected) return;
    if (sheetQty === 0) addToCart(selected);
    else increment(selected.id);
  };

  if (step === 'success' && result) {
    return (
      <div className="gt">
        <link rel="stylesheet" href={FONTS} />
        <div className="gt-confirmed">
          <div className="gt-confirmed-icon">✓</div>
          <p className="gt-confirmed-title">¡Pedido confirmado!</p>
          <p className="gt-confirmed-code">#{result.order_code}</p>
          <p className="gt-confirmed-hint">Abriendo WhatsApp…</p>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="gt-confirmed-link"
            >
              Abrir WhatsApp manualmente
            </a>
          )}
        </div>
        <GtStyles />
      </div>
    );
  }

  if (step === 'checkout') {
    return (
      <div className="gt">
        <link rel="stylesheet" href={FONTS} />
        <nav className="gt-nav">
          <button type="button" className="gt-back-btn" onClick={backToCatalog}>← Menú</button>
          <span className="gt-brand">{branch.name}</span>
          <span className="gt-nav-spacer" />
        </nav>
        <div className="gt-checkout-wrap">
          <p className="gt-checkout-eyebrow">Confirmá tu pedido</p>
          <CheckoutForm
            submitting={submitting}
            errorMessage={errorMessage}
            onSubmit={handleSubmit}
            onBack={backToCatalog}
          />
        </div>
        <GtStyles />
      </div>
    );
  }

  const sheetIsOpen = selectedIdx !== null;

  return (
    <div className="gt">
      <link rel="stylesheet" href={FONTS} />
      <div className="gt-grain" aria-hidden="true" />

      {/* ── NAV ── */}
      <nav className="gt-nav" aria-label="Navegación principal">
        <span className="gt-brand">{branch.name}</span>
        <ul className="gt-nav-cats">
          {categories.map(([cat]) => (
            <li key={cat}>
              <a href={`#${slugify(cat)}`} className="gt-nav-cat">{cat}</a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="gt-cart-trigger"
          onClick={() => setCartOpen(true)}
          aria-label={`Ver pedido — ${itemCount} ítems`}
        >
          <ShoppingBag size={14} aria-hidden="true" />
          Pedido
          {itemCount > 0 && <span className="gt-badge">{itemCount}</span>}
        </button>
      </nav>

      {/* ── HERO ── */}
      <header className="gt-hero">
        <div className="gt-hero-glow" aria-hidden="true" />
        <div className="gt-hero-content">
          <p className="gt-hero-eyebrow">Menú</p>
          <h1 className="gt-hero-name">{branch.name}</h1>
        </div>
        <div className="gt-scroll-indicator" aria-hidden="true">
          <span className="gt-scroll-line" />
        </div>
      </header>

      {/* ── CATALOG ── */}
      <main className="gt-catalog">
        {services.length === 0 ? (
          <p className="gt-empty">No hay productos disponibles todavía.</p>
        ) : (
          categories.map(([cat, items]) => (
            <section
              key={cat}
              id={slugify(cat)}
              className="gt-section"
              aria-labelledby={`hl-${slugify(cat)}`}
            >
              <div className="gt-section-head">
                <h2 id={`hl-${slugify(cat)}`} className="gt-section-title">{cat}</h2>
              </div>
              <div className="gt-tickets">
                {items.map((item) => {
                  const qty = cart[item.id] ?? 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="gt-ticket"
                      onClick={() => openSheet(item)}
                      aria-label={`${item.name}${qty > 0 ? ` — ${qty} en pedido` : ''}`}
                    >
                      <div className="gt-ticket-info">
                        <span className="gt-ticket-name">{item.name}</span>
                        {item.description && (
                          <span className="gt-ticket-desc">{item.description}</span>
                        )}
                      </div>
                      <div className="gt-ticket-right">
                        <span className="gt-ticket-price">{formatGuaranies(item.price)}</span>
                        {qty > 0 && (
                          <span className="gt-ticket-qty">{qty} ×</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>

      {/* ── FAB — mobile only, visible when cart has items ── */}
      {itemCount > 0 && (
        <button type="button" className="gt-fab" onClick={() => setCartOpen(true)}>
          <ShoppingBag size={15} aria-hidden="true" />
          Ver pedido
          <span className="gt-badge">{itemCount}</span>
        </button>
      )}

      {/* ── PRODUCT SHEET ── */}
      <div
        className={`gt-sheet-scrim${sheetIsOpen ? ' is-open' : ''}`}
        onClick={closeSheet}
        aria-hidden="true"
      />
      <div
        className={`gt-sheet${sheetIsOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={selected?.name ?? 'Producto'}
        aria-hidden={!sheetIsOpen}
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerUp}
        onPointerCancel={onSheetPointerCancel}
      >
        {selected && (
          <>
            {/* Nav: prev · counter · next · close */}
            <div className="gt-sheet-nav">
              <button
                type="button"
                className="gt-sheet-nav-btn"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                disabled={!hasPrev}
                aria-label="Producto anterior"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="gt-sheet-nav-pos">
                {selectedIdx! + 1} / {services.length}
              </span>
              <button
                type="button"
                className="gt-sheet-nav-btn"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                disabled={!hasNext}
                aria-label="Producto siguiente"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="gt-sheet-close"
                onClick={(e) => { e.stopPropagation(); closeSheet(); }}
                aria-label="Cerrar"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            {/* key + direction class trigger the enter animation on product change */}
            <div
              key={selected.id}
              className={`gt-sheet-content${
                exiting
                  ? ` is-exiting-${navDir ?? 'next'}`
                  : navDir ? ` dir-${navDir}` : ''
              }`}
            >
              {selected.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.image_url}
                  alt={selected.name}
                  className="gt-sheet-img"
                  draggable={false}
                />
              ) : (
                <div className="gt-sheet-img-empty" aria-hidden="true">
                  <UtensilsCrossed size={38} strokeWidth={1.2} />
                </div>
              )}

              <div className="gt-sheet-body">
                <h3 className="gt-sheet-name">{selected.name}</h3>
                {selected.description && (
                  <p className="gt-sheet-desc">{selected.description}</p>
                )}
                <p className="gt-sheet-price">{formatGuaranies(selected.price)}</p>
              </div>

              <div className="gt-sheet-foot">
                {sheetQty > 0 && (
                  <div className="gt-qty-row">
                    <button
                      type="button"
                      className="gt-qty-btn"
                      aria-label="Restar uno"
                      onClick={(e) => { e.stopPropagation(); decrement(selected.id); }}
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span className="gt-qty-n">{sheetQty}</span>
                    <button
                      type="button"
                      className="gt-qty-btn"
                      aria-label="Sumar uno"
                      onClick={(e) => { e.stopPropagation(); handleSheetAdd(); }}
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="gt-sheet-cta"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (sheetQty === 0) {
                      addToCart(selected);
                      // sheet stays open — user can keep browsing
                    } else {
                      // "Ver pedido" → open cart drawer
                      closeSheet();
                      setCartOpen(true);
                    }
                  }}
                >
                  {sheetQty > 0
                    ? `Ver pedido · ${formatGuaranies(total)}`
                    : 'Agregar al pedido'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── CART DRAWER ── */}
      <div
        className={`gt-overlay${cartOpen ? ' is-open' : ''}`}
        onClick={() => setCartOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`gt-drawer${cartOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Tu pedido"
        aria-hidden={!cartOpen}
      >
        <div className="gt-drawer-head">
          <h3 className="gt-drawer-title">Tu pedido</h3>
          <button
            type="button"
            className="gt-drawer-close"
            onClick={() => setCartOpen(false)}
            aria-label="Cerrar pedido"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="gt-drawer-body">
          {lines.length === 0 ? (
            <p className="gt-drawer-empty">
              Todavía no elegiste nada.<br />
              Explorá el menú.
            </p>
          ) : (
            lines.map((line) => (
              <div className="gt-drawer-item" key={line.service.id}>
                <div className="gt-drawer-item-info">
                  <span className="gt-drawer-item-name">{line.service.name}</span>
                  <span className="gt-drawer-item-price">
                    {formatGuaranies(line.service.price)} c/u
                  </span>
                </div>
                <div className="gt-drawer-qty">
                  <button
                    type="button"
                    className="gt-qty-btn sm"
                    aria-label={`Restar ${line.service.name}`}
                    onClick={() => decrement(line.service.id)}
                  >
                    <Minus size={12} aria-hidden="true" />
                  </button>
                  <span className="gt-qty-n">{line.qty}</span>
                  <button
                    type="button"
                    className="gt-qty-btn sm"
                    aria-label={`Sumar ${line.service.name}`}
                    onClick={() => increment(line.service.id)}
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="gt-drawer-foot">
          <div className="gt-drawer-total">
            <span>Total</span>
            <strong>{formatGuaranies(total)}</strong>
          </div>
          <button
            type="button"
            className="gt-drawer-cta"
            disabled={lines.length === 0}
            onClick={() => { setCartOpen(false); goToCheckout(); }}
          >
            <MessageCircle size={15} aria-hidden="true" />
            Continuar pedido
          </button>
        </div>
      </div>

      <GtStyles />
    </div>
  );
}

function GtStyles() {
  return (
    <style>{`
      /* ── TOKENS: dark-first ── */
      .gt {
        --bg:       #140e0b;
        --surf:     #1c1512;
        --surf-hi:  #251c17;
        --ember:    #c4602a;
        --ember-b:  #e0692a;
        --amber:    #e8a566;
        --amber-d:  #c98a55;
        --brass:    #c2966a;
        --cream:    #fdf6ee;
        --parch:    #e9dcc9;
        --smoke:    #9a8070;
        --line:     rgba(232,165,102,.14);
        --shadow:   rgba(10,6,4,.55);
        --glow:     rgba(196,96,42,.30);
        --fd: 'Playfair Display', Georgia, 'Iowan Old Style', serif;
        --fb: 'Work Sans', system-ui, sans-serif;
        --fm: 'JetBrains Mono', ui-monospace, monospace;

        position: relative;
        min-height: 100svh;
        background: var(--bg);
        color: var(--cream);
        font-family: var(--fb);
        display: flex;
        flex-direction: column;
        overflow-x: clip;
        color-scheme: dark;
      }

      /* always dark — brand colors, no light override */

      /* ── GRAIN TEXTURE ── */
      .gt-grain {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 1;
        opacity: .045;
        mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }

      /* ── NAV ── */
      .gt-nav {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 13px 22px;
        background: color-mix(in srgb, var(--bg) 82%, transparent);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-bottom: 1px solid var(--line);
      }
      .gt-brand {
        font-family: var(--fd);
        font-size: 17px;
        font-weight: 700;
        color: var(--cream);
        flex-shrink: 0;
        white-space: nowrap;
      }
      .gt-nav-cats {
        flex: 1;
        display: flex;
        list-style: none;
        margin: 0;
        padding: 0;
        gap: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .gt-nav-cats::-webkit-scrollbar { display: none; }
      .gt-nav-cat {
        font-family: var(--fm);
        font-size: 10px;
        letter-spacing: 1.1px;
        text-transform: uppercase;
        color: var(--parch);
        text-decoration: none;
        padding: 5px 11px;
        white-space: nowrap;
        opacity: .6;
        transition: opacity .2s, color .2s;
      }
      .gt-nav-cat:hover { opacity: 1; color: var(--amber); }
      .gt-cart-trigger {
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--line);
        border-radius: 100px;
        background: transparent;
        color: var(--cream);
        font-family: var(--fm);
        font-size: 10px;
        letter-spacing: .8px;
        padding: 6px 12px;
        cursor: pointer;
        flex-shrink: 0;
        white-space: nowrap;
        transition: border-color .2s, background .2s;
        min-height: 34px;
      }
      .gt-cart-trigger:hover {
        border-color: var(--ember-b);
        background: rgba(196,96,42,.1);
      }
      .gt-badge {
        min-width: 17px;
        height: 17px;
        border-radius: 50%;
        background: var(--ember-b);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        padding: 0 3px;
      }
      .gt-back-btn {
        background: none;
        border: none;
        color: var(--smoke);
        font-family: var(--fm);
        font-size: 10px;
        letter-spacing: 1px;
        text-transform: uppercase;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        transition: color .2s;
      }
      .gt-back-btn:hover { color: var(--amber); }
      .gt-nav-spacer { flex: 0 0 80px; }

      /* ── HERO ── */
      .gt-hero {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 88px 24px 68px;
        overflow: hidden;
      }
      .gt-hero-glow {
        position: absolute;
        bottom: -30%;
        left: 50%;
        transform: translateX(-50%);
        width: 700px;
        height: 560px;
        max-width: 160vw;
        background: radial-gradient(ellipse, var(--glow) 0%, transparent 66%);
        filter: blur(6px);
        pointer-events: none;
        animation: gt-pulse 7s ease-in-out infinite;
      }
      @keyframes gt-pulse {
        0%, 100% { opacity: .7; transform: translateX(-50%) scale(1); }
        50%       { opacity: 1; transform: translateX(-50%) scale(1.07); }
      }
      .gt-hero-content { position: relative; z-index: 1; }
      .gt-hero-eyebrow {
        font-family: var(--fm);
        font-size: 10px;
        letter-spacing: 3.5px;
        text-transform: uppercase;
        color: var(--amber);
        margin: 0 0 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      .gt-hero-eyebrow::before,
      .gt-hero-eyebrow::after {
        content: '';
        width: 22px;
        height: 1px;
        background: var(--amber-d);
        opacity: .6;
      }
      .gt-hero-name {
        font-family: var(--fd);
        font-size: clamp(40px, 9vw, 80px);
        font-weight: 700;
        color: var(--cream);
        margin: 0;
        line-height: 1;
        letter-spacing: -.4px;
        text-wrap: balance;
      }
      .gt-scroll-indicator {
        position: absolute;
        bottom: 22px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1;
      }
      .gt-scroll-line {
        display: block;
        width: 1px;
        height: 30px;
        background: linear-gradient(var(--amber-d), transparent);
        animation: gt-drop 2s ease-in-out infinite;
      }
      @keyframes gt-drop {
        0%   { opacity: 0; transform: scaleY(.2); transform-origin: top; }
        45%  { opacity: 1; transform: scaleY(1); }
        100% { opacity: 0; transform: scaleY(1); }
      }

      /* ── CATALOG ── */
      .gt-catalog {
        position: relative;
        z-index: 2;
        max-width: 860px;
        width: 100%;
        margin: 0 auto;
        padding: 0 24px 140px;
      }
      .gt-section { padding-top: 64px; }
      .gt-section-head { margin-bottom: 28px; }
      .gt-section-title {
        font-family: var(--fd);
        font-size: clamp(28px, 5vw, 44px);
        font-weight: 400;
        color: var(--cream);
        margin: 0;
      }
      .gt-empty {
        text-align: center;
        padding: 80px 24px;
        font-family: var(--fm);
        font-size: 12px;
        color: var(--smoke);
        letter-spacing: 1px;
      }

      /* ── TICKET LIST ── */
      .gt-tickets {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0;
      }
      .gt-ticket {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 20px;
        align-items: start;
        padding: 22px 6px;
        border-bottom: 1px dashed var(--line);
        text-align: left;
        background: none;
        border-top: none;
        border-left: none;
        border-right: none;
        cursor: pointer;
        color: inherit;
        transition: padding-left .22s;
      }
      .gt-ticket:first-child { border-top: 1px dashed var(--line); }
      .gt-ticket:hover { padding-left: 14px; }
      .gt-ticket:hover .gt-ticket-name { color: var(--amber); }
      .gt-ticket-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      .gt-ticket-name {
        font-family: var(--fd);
        font-size: 19px;
        font-weight: 400;
        color: var(--cream);
        transition: color .2s;
        text-wrap: balance;
      }
      .gt-ticket-desc {
        font-size: 13px;
        line-height: 1.65;
        color: var(--parch);
        opacity: .7;
        max-width: 420px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .gt-ticket-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        flex-shrink: 0;
      }
      .gt-ticket-price {
        font-family: var(--fm);
        font-size: 14px;
        color: var(--amber);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .gt-ticket-qty {
        font-family: var(--fm);
        font-size: 10px;
        color: var(--ember-b);
        background: rgba(196,96,42,.14);
        border-radius: 100px;
        padding: 2px 8px;
        letter-spacing: .4px;
      }

      /* ── FAB ── */
      .gt-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 60;
        display: none;
        align-items: center;
        gap: 7px;
        background: var(--ember);
        color: #fff;
        border: none;
        border-radius: 100px;
        padding: 12px 18px;
        font-family: var(--fb);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 6px 24px var(--shadow), 0 0 40px var(--glow);
        transition: background .2s;
      }
      .gt-fab:hover { background: var(--ember-b); }
      @media (max-width: 767px) { .gt-fab { display: flex; } }

      /* ── PRODUCT SHEET ── */
      .gt-sheet-scrim {
        position: fixed;
        inset: 0;
        background: rgba(10,6,4,.62);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 80;
        opacity: 0;
        pointer-events: none;
        transition: opacity .3s;
      }
      .gt-sheet-scrim.is-open {
        opacity: 1;
        pointer-events: auto;
      }
      .gt-sheet {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 81;
        background: var(--surf);
        border-top: 1px solid var(--line);
        border-radius: 20px 20px 0 0;
        transform: translateY(100%);
        transition: transform .36s cubic-bezier(.4,0,.2,1);
        touch-action: pan-y;
        max-height: 90svh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      /* base open state must come BEFORE the desktop media query so the
         desktop rule wins at equal specificity via source order */
      .gt-sheet.is-open { transform: translateY(0); }
      @media (min-width: 640px) {
        .gt-sheet {
          left: 50%;
          right: auto;
          transform: translate(-50%, 100%);
          width: 480px;
          border-radius: 16px 16px 0 0;
        }
        .gt-sheet.is-open {
          transform: translate(-50%, 0);
        }
      }
      /* hint dots for swipe navigation */
      .gt-sheet-dots {
        display: flex;
        justify-content: center;
        gap: 5px;
        padding: 8px 0 0;
      }
      .gt-sheet-dot {
        width: 5px; height: 5px; border-radius: 50%;
        background: var(--line);
        transition: background .2s, transform .2s;
      }
      .gt-sheet-dot.active {
        background: var(--amber);
        transform: scale(1.25);
      }
      /* sheet nav row (prev · pos · next · close) */
      .gt-sheet-nav {
        display: flex;
        align-items: center;
        gap: 0;
        padding: 10px 14px 10px 10px;
        border-bottom: 1px solid var(--line);
        flex-shrink: 0;
      }
      .gt-sheet-nav-btn {
        width: 36px;
        height: 36px;
        border: none;
        background: transparent;
        color: var(--smoke);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        transition: background .15s, color .15s;
      }
      .gt-sheet-nav-btn:hover:not(:disabled) {
        background: rgba(255,255,255,.06);
        color: var(--cream);
      }
      .gt-sheet-nav-btn:disabled { opacity: .25; cursor: not-allowed; }
      .gt-sheet-nav-pos {
        flex: 1;
        text-align: center;
        font-family: var(--fm);
        font-size: 10px;
        letter-spacing: 1.2px;
        color: var(--smoke);
      }
      .gt-sheet-close {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(255,255,255,.08);
        border: none;
        color: var(--cream);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background .18s;
        flex-shrink: 0;
      }
      .gt-sheet-close:hover { background: rgba(255,255,255,.15); }
      /* ── PRODUCT TRANSITION ANIMATIONS ── */
      @keyframes gt-slide-in-r {
        0%   { opacity: 0; transform: translateX(56px); }
        55%  { opacity: 1; transform: translateX(-7px); }
        75%  { transform: translateX(3px); }
        100% { opacity: 1; transform: translateX(0); }
      }
      @keyframes gt-slide-in-l {
        0%   { opacity: 0; transform: translateX(-56px); }
        55%  { opacity: 1; transform: translateX(7px); }
        75%  { transform: translateX(-3px); }
        100% { opacity: 1; transform: translateX(0); }
      }
      @keyframes gt-slide-out-l {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(-56px); }
      }
      @keyframes gt-slide-out-r {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(56px); }
      }
      @keyframes gt-img-spin-r {
        from { transform: translateX(28px) rotate(9deg) scale(0.82); }
        to   { transform: translateX(0) rotate(0deg) scale(1); }
      }
      @keyframes gt-img-spin-l {
        from { transform: translateX(-28px) rotate(-9deg) scale(0.82); }
        to   { transform: translateX(0) rotate(0deg) scale(1); }
      }
      @keyframes gt-text-rise {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes gt-sheet-open {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      /* content slide — default (fresh open from catalog) */
      .gt-sheet-content {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        flex: 1;
        animation: gt-sheet-open .22s ease both;
      }
      /* enter from right (user pressed next) */
      .gt-sheet-content.dir-next {
        animation: gt-slide-in-r .44s ease both;
      }
      /* enter from left (user pressed prev) */
      .gt-sheet-content.dir-prev {
        animation: gt-slide-in-l .44s ease both;
      }
      /* exit to left (next was pressed — old content leaves left) */
      .gt-sheet-content.is-exiting-next {
        animation: gt-slide-out-l .16s ease-in both;
      }
      /* exit to right (prev was pressed — old content leaves right) */
      .gt-sheet-content.is-exiting-prev {
        animation: gt-slide-out-r .16s ease-in both;
      }
      /* image rotation on enter — makes it feel physical like the GSAP reference */
      .gt-sheet-content.dir-next .gt-sheet-img,
      .gt-sheet-content.dir-next .gt-sheet-img-empty {
        animation: gt-img-spin-r .44s ease both;
      }
      .gt-sheet-content.dir-prev .gt-sheet-img,
      .gt-sheet-content.dir-prev .gt-sheet-img-empty {
        animation: gt-img-spin-l .44s ease both;
      }
      /* staggered text reveal */
      .gt-sheet-content.dir-next .gt-sheet-name,
      .gt-sheet-content.dir-prev .gt-sheet-name {
        animation: gt-text-rise .32s .06s ease both;
      }
      .gt-sheet-content.dir-next .gt-sheet-desc,
      .gt-sheet-content.dir-prev .gt-sheet-desc {
        animation: gt-text-rise .32s .12s ease both;
      }
      .gt-sheet-content.dir-next .gt-sheet-price,
      .gt-sheet-content.dir-prev .gt-sheet-price {
        animation: gt-text-rise .32s .17s ease both;
      }
      .gt-sheet-img {
        width: 100%;
        aspect-ratio: 16/9;
        object-fit: cover;
        flex-shrink: 0;
        display: block;
        user-select: none;
        -webkit-user-drag: none;
      }
      .gt-sheet-img-empty {
        width: 100%;
        height: 160px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at center,
          color-mix(in srgb, var(--ember) 20%, var(--surf-hi)) 0%,
          var(--surf-hi) 100%);
        color: var(--ember);
        opacity: .65;
      }
      .gt-sheet-body {
        padding: 22px 22px 14px;
        overflow-y: auto;
      }
      .gt-sheet-name {
        font-family: var(--fd);
        font-size: 25px;
        font-weight: 600;
        color: var(--cream);
        margin: 0 0 10px;
        line-height: 1.2;
        text-wrap: balance;
      }
      .gt-sheet-desc {
        font-size: 14px;
        line-height: 1.7;
        color: var(--parch);
        margin: 0 0 16px;
      }
      .gt-sheet-price {
        font-family: var(--fm);
        font-size: 22px;
        color: var(--amber);
        margin: 0;
        font-variant-numeric: tabular-nums;
      }
      .gt-sheet-foot {
        padding: 14px 18px 28px;
        border-top: 1px solid var(--line);
        display: flex;
        gap: 10px;
        align-items: center;
        background: var(--surf);
        flex-shrink: 0;
      }
      .gt-sheet-cta {
        flex: 1;
        height: 48px;
        border: none;
        border-radius: 100px;
        background: var(--cream);
        color: var(--bg);
        font-family: var(--fb);
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        letter-spacing: .2px;
        transition: background .2s;
        min-height: 44px;
      }
      .gt-sheet-cta:hover { background: var(--amber); }

      /* ── QTY CONTROLS ── */
      .gt-qty-row {
        display: flex;
        align-items: center;
        gap: 0;
        background: var(--surf-hi);
        border: 1px solid var(--line);
        border-radius: 100px;
        overflow: hidden;
        flex-shrink: 0;
      }
      .gt-qty-btn {
        width: 40px;
        height: 44px;
        border: none;
        background: transparent;
        color: var(--cream);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background .15s;
      }
      .gt-qty-btn:hover { background: rgba(196,96,42,.14); }
      .gt-qty-btn:disabled { opacity: .3; cursor: not-allowed; }
      .gt-qty-btn.sm {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1px solid var(--line);
        background: var(--surf-hi);
        color: var(--ember);
      }
      .gt-qty-btn.sm:hover { background: rgba(196,96,42,.15); }
      .gt-qty-n {
        width: 30px;
        text-align: center;
        font-family: var(--fm);
        font-size: 14px;
        font-weight: 600;
        color: var(--cream);
      }

      /* ── CART DRAWER ── */
      .gt-overlay {
        position: fixed;
        inset: 0;
        background: rgba(10,6,4,.52);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
        z-index: 90;
        opacity: 0;
        pointer-events: none;
        transition: opacity .25s;
      }
      .gt-overlay.is-open {
        opacity: 1;
        pointer-events: auto;
      }
      .gt-drawer {
        position: fixed;
        top: 0;
        right: 0;
        height: 100%;
        width: min(400px, 94vw);
        z-index: 91;
        background: var(--surf);
        border-left: 1px solid var(--line);
        transform: translateX(100%);
        transition: transform .33s cubic-bezier(.4,0,.2,1);
        display: flex;
        flex-direction: column;
      }
      .gt-drawer.is-open { transform: translateX(0); }
      .gt-drawer-head {
        padding: 18px 22px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .gt-drawer-title {
        font-family: var(--fd);
        font-size: 20px;
        font-weight: 600;
        color: var(--cream);
        margin: 0;
      }
      .gt-drawer-close {
        background: none;
        border: none;
        color: var(--smoke);
        cursor: pointer;
        display: flex;
        padding: 4px;
        transition: color .2s;
      }
      .gt-drawer-close:hover { color: var(--cream); }
      .gt-drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 6px 22px;
      }
      .gt-drawer-empty {
        font-family: var(--fm);
        font-size: 11px;
        letter-spacing: .5px;
        color: var(--smoke);
        text-align: center;
        padding: 40px 0;
        line-height: 1.9;
      }
      .gt-drawer-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 14px 0;
        border-bottom: 1px dashed var(--line);
      }
      .gt-drawer-item-info { min-width: 0; }
      .gt-drawer-item-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--cream);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
      }
      .gt-drawer-item-price {
        font-family: var(--fm);
        font-size: 11px;
        color: var(--smoke);
        margin-top: 3px;
        display: block;
      }
      .gt-drawer-qty {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .gt-drawer-foot {
        padding: 14px 22px 28px;
        border-top: 1px solid var(--line);
        flex-shrink: 0;
      }
      .gt-drawer-total {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-family: var(--fb);
        font-size: 13px;
        color: var(--smoke);
        margin-bottom: 14px;
      }
      .gt-drawer-total strong {
        font-family: var(--fm);
        font-size: 20px;
        color: var(--amber);
        font-variant-numeric: tabular-nums;
      }
      .gt-drawer-cta {
        width: 100%;
        height: 50px;
        border: none;
        border-radius: 10px;
        background: var(--ember);
        color: #fff;
        font-family: var(--fb);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: .5px;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        transition: background .2s;
        min-height: 44px;
      }
      .gt-drawer-cta:hover:not(:disabled) { background: var(--ember-b); }
      .gt-drawer-cta:disabled { opacity: .4; cursor: not-allowed; }

      /* ── CHECKOUT / SUCCESS ── */
      .gt-checkout-wrap {
        position: relative;
        z-index: 2;
        max-width: 520px;
        margin: 0 auto;
        padding: 36px 24px 100px;
      }
      .gt-checkout-eyebrow {
        font-family: var(--fm);
        font-size: 10px;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        color: var(--ember);
        margin-bottom: 28px;
      }
      .gt-confirmed {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100svh;
        gap: 10px;
        text-align: center;
        padding: 40px 24px;
      }
      .gt-confirmed-icon {
        font-size: 52px;
        color: var(--ember);
        margin-bottom: 8px;
      }
      .gt-confirmed-title {
        font-family: var(--fd);
        font-size: 1.7rem;
        color: var(--cream);
      }
      .gt-confirmed-code {
        font-family: var(--fm);
        font-size: .9rem;
        color: var(--amber);
        letter-spacing: .08em;
      }
      .gt-confirmed-hint {
        color: var(--smoke);
        font-size: .85rem;
        margin-top: 6px;
      }
      .gt-confirmed-link {
        margin-top: 16px;
        font-size: .8rem;
        color: var(--ember);
        text-decoration: underline;
      }

      /* ── REDUCED MOTION ── */
      @media (prefers-reduced-motion: reduce) {
        .gt-hero-glow { animation: none; }
        .gt-scroll-line { animation: none; }
        .gt-sheet,
        .gt-drawer,
        .gt-sheet-scrim,
        .gt-overlay { transition-duration: 0.01ms; }
      }
    `}</style>
  );
}
