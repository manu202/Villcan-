'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ShoppingBag, X, Plus, Minus, MessageCircle, UtensilsCrossed,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { CheckoutStep } from '../CheckoutStep';
import { useStorefrontCart } from '../useStorefrontCart';
import { useActiveCategory } from '../primitives/useActiveCategory';
import { StorefrontSheet } from '../primitives/StorefrontSheet';
import { FireCanvas, GtStyles } from './GastronomyTheme';
import { formatGuaranies } from '@/lib/utils';
import type { Branch, Service } from '@/types';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;500;600;700&family=Work+Sans:wght@300;400;500;600&display=swap';

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
    deliveryLocation, setDeliveryLocation,
    deliveryType, setDeliveryType, deliveryAddress, setDeliveryAddress,
    addToCart, increment, decrement,
    goToCart, goToPayment, backToCatalog, backToCart, handleSubmit,
  } = useStorefrontCart(branch, services);

  // The cart drawer's *open* state is derived from `step` — there is no
  // separate `cartOpen` flag to drift out of sync. 'cart' and 'payment' both
  // render inside the same drawer surface ('payment' is the single combined
  // checkout form — pickup/delivery, address, and payment method all live
  // there now, so there's no separate 'delivery-data' screen to reach);
  // 'catalog' and 'success' don't. This is also what lets the catalog stay
  // mounted: the component never early-`return`s on those steps anymore, it
  // just swaps what the drawer shows.
  const cartOpen = step === 'cart' || step === 'payment';
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [navDir, setNavDir] = useState<'next' | 'prev' | null>(null);
  const [exiting, setExiting] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; active: boolean; captured: boolean; touchId: number | null }>({ startX: 0, startY: 0, active: false, captured: false, touchId: null });
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const navFlameOpacity = useTransform(scrollYProgress, [0.45, 0.85], [0, 1]);
  const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  const categories = useMemo(() => groupByCategory(services), [services]);
  const categoryNames = useMemo(() => categories.map(([cat]) => cat), [categories]);
  const { activeCategory, navRef, pillListRef, navHeight, selectCategory } = useActiveCategory({
    categories: categoryNames,
    slugify,
  });

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
    if (dragRef.current.active) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, active: true, captured: false, touchId: null };
  };
  const onSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.captured || dragRef.current.touchId !== null) return;
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
    if (!dragRef.current.active || dragRef.current.touchId !== null) return;
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
      if (cartOpen && e.key === 'Escape') backToCatalog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cartOpen, selectedIdx]);

  // The cart drawer is still hand-rolled, so it still needs a manual scroll
  // lock. The product sheet is now vaul-driven (StorefrontSheet) and vaul
  // manages its own body scroll lock — including `selected` here would
  // double-manage the same style and risk the two locks racing on cleanup.
  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      if (e.type === 'touchstart') {
        dragRef.current = { startX: touch.clientX, startY: touch.clientY, active: true, captured: false, touchId: touch.identifier };
        return;
      }
      if (e.type === 'touchmove') {
        if (!dragRef.current.active || dragRef.current.captured) return;
        const dx = Math.abs(touch.clientX - dragRef.current.startX);
        const dy = Math.abs(touch.clientY - dragRef.current.startY);
        if (dx > 10 && dx > dy * 1.5) {
          e.preventDefault();
          dragRef.current.captured = true;
        } else if (dy > 10) {
          dragRef.current.active = false;
        }
        return;
      }
      if (e.type === 'touchend') {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        const dx = touch.clientX - dragRef.current.startX;
        if (Math.abs(dx) < 48) return;
        if (dx < 0) goNext();
        else goPrev();
      }
    };
    el.addEventListener('touchstart', handler, { passive: false });
    el.addEventListener('touchmove', handler, { passive: false });
    el.addEventListener('touchend', handler, { passive: false });
    return () => {
      el.removeEventListener('touchstart', handler);
      el.removeEventListener('touchmove', handler);
      el.removeEventListener('touchend', handler);
    };
  }, [goNext, goPrev]);

  // When the order is confirmed, go directly to WhatsApp
  useEffect(() => {
    if (step === 'success' && whatsappHref) {
      window.location.href = whatsappHref;
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
        <FireCanvas />
        <div className="gt-confirmed">
          <div className="gt-confirmed-icon">✓</div>
          <p className="gt-confirmed-title">¡Pedido confirmado!</p>
          <p className="gt-confirmed-code">#{result.order_code}</p>
          <p className="gt-confirmed-hint">Abriendo WhatsApp…</p>
          {whatsappHref && (
            <a
              href={whatsappHref}
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

  // 'payment' no longer early-`return`s a full-screen takeover — it renders
  // as a step of the same cart drawer below, so the catalog (scroll
  // position, category IntersectionObserver) never unmounts. See
  // useActiveCategory + REQ-CART-NAV regression test "keeps the catalog
  // mounted underneath the checkout step".
  const sheetIsOpen = selectedIdx !== null;

  return (
    <div className="gt">
      <link rel="stylesheet" href={FONTS} />
      <FireCanvas />

      {/* ── NAV ── */}
      <nav className="gt-nav" aria-label="Navegación principal" ref={navRef as React.RefObject<HTMLElement>}>
        <div className="gt-nav-top">
          <span className="gt-brand">
            <motion.span className="gt-nav-fire" style={{ opacity: navFlameOpacity }} aria-hidden="true">
              <svg width="14" height="20" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 18C7 18 1 14 1 8.5C1 5.5 3.5 2 7 2C10.5 2 13 5.5 13 8.5C13 14 7 18 7 18Z" fill="#E86A1A" className="gt-nav-flame-outer"/>
                <path d="M7 15C7 15 4 12.5 4 9.5C4 7.5 5.5 5.5 7 5.5C8.5 5.5 10 7.5 10 9.5C10 12.5 7 15 7 15Z" fill="#FFB340" className="gt-nav-flame-inner"/>
                <path d="M7 12C7 12 5.5 10.5 5.5 9C5.5 8 6.2 7 7 7C7.8 7 8.5 8 8.5 9C8.5 10.5 7 12 7 12Z" fill="#FFF0A0" className="gt-nav-flame-tip"/>
              </svg>
            </motion.span>
            {branch.name}
          </span>
          <button
            type="button"
            className={`gt-cart-trigger${itemCount > 0 ? ' has-fab' : ''}`}
            onClick={goToCart}
            aria-label={`Ver pedido — ${itemCount} ítems`}
          >
            <ShoppingBag size={14} aria-hidden="true" />
            Pedido
            {itemCount > 0 && <span className="gt-badge">{itemCount}</span>}
          </button>
        </div>
        <ul className="gt-nav-cats" ref={pillListRef as React.RefObject<HTMLUListElement>}>
          {categories.map(([cat]) => (
            <li key={cat}>
              {/* href kept for accessibility/no-JS fallback; the click handler
                  drives the actual scroll so it lands below the sticky header
                  (native #hash jump ignores scroll-margin timing quirks across
                  browsers) and so selectCategory can suppress spy flicker. */}
              <a
                href={`#${slugify(cat)}`}
                className={`gt-nav-cat${activeCategory === cat ? ' is-active' : ''}`}
                data-active={activeCategory === cat ? 'true' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  selectCategory(cat);
                }}
              >
                {cat}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── HERO ── */}
      <header ref={heroRef} className="gt-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-tatapiriri.jpg"
          alt=""
          className="gt-hero-img"
          aria-hidden="true"
          draggable={false}
          fetchPriority="high"
        />
        <div className="gt-hero-glow" aria-hidden="true" />
        <div className="gt-hero-content">
          <p className="gt-hero-eyebrow">Menú</p>
          <h1 className="gt-hero-name">{branch.name}</h1>
          <p className="gt-hero-sub">
            Al puro estilo napolitano<br />
            <em>El fuego<br />no descansa.</em>
          </p>
        </div>
        <motion.div className="gt-scroll-indicator" style={{ opacity: scrollIndicatorOpacity }} aria-hidden="true">
          <span className="gt-scroll-line" />
        </motion.div>
      </header>

      {/* ── CATALOG ── */}
      {/* aria-hidden while the product sheet or cart drawer is open — the
          catalog stays mounted underneath (scroll position, IntersectionObserver
          survive) but must not be exposed to assistive tech behind an open
          dialog, or e.g. an item's description ends up "visible" twice. */}
      <main className="gt-catalog" aria-hidden={sheetIsOpen || cartOpen || undefined}>
        {services.length === 0 ? (
          <p className="gt-empty">No hay productos disponibles todavía.</p>
        ) : (
          categories.map(([cat, items]) => (
            <section
              key={cat}
              id={slugify(cat)}
              className="gt-section"
              aria-labelledby={`hl-${slugify(cat)}`}
              style={{ scrollMarginTop: navHeight || undefined }}
            >
              <div className="gt-glass-card">
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
              </div>
            </section>
          ))
        )}
      </main>

      {/* ── FAB — mobile only, visible when cart has items ── */}
      {itemCount > 0 && (
        <button
          type="button"
          className="gt-fab"
          onClick={goToCart}
          aria-label={`Ver pedido — total ${formatGuaranies(total)}`}
        >
          <ShoppingBag size={15} aria-hidden="true" />
          Ver pedido
          <span className="gt-fab-total">{formatGuaranies(total)}</span>
          <span className="gt-badge">{itemCount}</span>
        </button>
      )}

      {/* ── PRODUCT SHEET — vaul-driven (StorefrontSheet). dismissible=false:
          the content owns its own horizontal swipe-between-products gesture
          (onSheetPointer*), which would compete with vaul's own vertical
          drag-to-dismiss on the same surface. Explicit close (X button,
          overlay tap, Escape) still works — only the drag-down-to-dismiss
          gesture is disabled. ── */}
      <StorefrontSheet
        open={sheetIsOpen}
        onOpenChange={(open) => { if (!open) closeSheet(); }}
        contentClassName="gt-sheet"
        overlayClassName="gt-sheet-scrim"
        ariaLabel={selected?.name ?? 'Producto'}
        dismissible={false}
      >
        <div
          ref={sheetRef}
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
                      goToCart();
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
      </StorefrontSheet>

      {/* ── CART DRAWER — also hosts the delivery-data and payment steps, so
          checking out never unmounts the catalog behind it (see the early-
          return removal above and the regression test for this). ── */}
      <div
        className={`gt-overlay${cartOpen ? ' is-open' : ''}`}
        onClick={backToCatalog}
        aria-hidden="true"
      />
      <div
        className={`gt-drawer${cartOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={step === 'payment' ? 'Confirmá tu pedido' : 'Tu pedido'}
        aria-hidden={!cartOpen}
      >
        <div className="gt-drawer-head">
          {step !== 'cart' && (
            <button
              type="button"
              className="gt-drawer-close"
              onClick={backToCart}
              aria-label="Volver"
            >
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
          )}
          <h3 className="gt-drawer-title">
            {step === 'payment' ? 'Confirmá tu pedido' : 'Tu pedido'}
          </h3>
          <button
            type="button"
            className="gt-drawer-close"
            onClick={backToCatalog}
            aria-label="Cerrar pedido"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        {step === 'cart' && (
          <>
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
                onClick={goToPayment}
              >
                <MessageCircle size={15} aria-hidden="true" />
                Continuar pedido
              </button>
            </div>
          </>
        )}

        {/* Delivery vs. pickup, address/GPS, payment method — all one form.
            There used to be a separate "delivery-data" screen asked before
            this one; direct user feedback: that extra step, plus asking
            pickup-vs-delivery on its own before the actual form, was
            unnecessary friction. Now it's all here, conditionally. */}
        {step === 'payment' && (
          <div className="gt-drawer-body gt-drawer-step-body">
            <CheckoutStep
              deliveryType={deliveryType}
              onDeliveryTypeChange={setDeliveryType}
              deliveryAddress={deliveryAddress}
              onAddressChange={setDeliveryAddress}
              deliveryLocation={deliveryLocation}
              onLocationCapture={setDeliveryLocation}
              submitting={submitting}
              errorMessage={errorMessage}
              onSubmit={handleSubmit}
              onBack={backToCart}
            />
          </div>
        )}
      </div>

      <GtStyles />
    </div>
  );
}

