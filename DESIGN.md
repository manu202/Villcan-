# Villcan — Barber Shop Cash Management App

## Context

A mobile-first app for a barbershop to manage cash register movements. The current AppSheet app works but is slow. Goal: rebuild with Next.js + Supabase for better performance.

## Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router, PWA) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Deploy | Vercel (free) |
| Styles | Tailwind CSS 4 + a semantic CSS-custom-property token layer (see "Theming System" below) |
| Icons | lucide-react (introduced in the design-tokens-and-dark-mode change; not yet rolled out app-wide) |

---

## Data Model

### Tables

```sql
-- Users (from Supabase Auth + custom profile)
profiles (
  id UUID PRIMARY KEY REFERENCES auth.users,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'barber')) DEFAULT 'barber',
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Services offered
services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price INTEGER NOT NULL, -- stored in guaranies, no decimals
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
)

-- Clients/Contacts
contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  ci TEXT, -- cédula de identidad
  phone TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Cash movements
movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT CHECK (type IN ('servicio', 'gasto', 'apertura', 'cierre')) NOT NULL,
  amount_charged INTEGER, -- precio del servicio (solo para tipo=servicio)
  income INTEGER DEFAULT 0, -- dinero que entra
  expense INTEGER DEFAULT 0, -- dinero que sale (vuelto en servicio, gasto, etc)
  payment_method TEXT CHECK (payment_method IN ('efectivo', 'transferencia', 'pos')),
  contact_id UUID REFERENCES contacts(id),
  service_id UUID REFERENCES services(id),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### Balance Calculation Logic

```sql
-- For each payment method, balance is:
balance_method = Σ(income) - Σ(expense)
  WHERE type = 'servicio' AND payment_method = method

-- For gastos (expenses):
gastos_total = Σ(expense) WHERE type = 'gasto'

-- Global balance = sum of all method balances
```

### Cash Flow by Type

| Type | Income | Expense | Effect on Balance |
|------|--------|---------|-------------------|
| **Servicio** | +monto cliente paga | +vuelto (si hay) | neto = amount_charged |
| **Gasto** | 0 | -monto | resta del balance |
| **Apertura** | +monto | +mismo monto | inicial del turno |
| **Cierre** | 0 | -monto | extracción/deposito |

---

## Page Structure

### Navigation

- **Hamburger menu** top-left corner (☰), rendered by `src/components/HamburgerMenu.tsx`
- **Full-screen modules** — each page takes 100% viewport, no bottom bar stealing space
- **Drawer overlay** — hamburger opens a slide-in drawer from the left with navigation links, the branch selector, the theme toggle, and auth controls

There is **no bottom tab bar** — navigation is exclusively the hamburger + drawer described above (an earlier draft of this doc incorrectly described bottom tabs; the app has never shipped that).

```
┌─────────────────────────────┐
│ ☰                           │  ← Hamburger top-left
│                             │
│                             │
│      [FULL SCREEN MODULE]   │  ← Module takes entire viewport
│                             │
│                             │
│                             │
└─────────────────────────────┘

When hamburger open:
┌─────────────────────────────┐
│ ☰  VILLCAN          │
├─────────────────────┤
│                     │
│  🏠  Caja           │
│  📋  Movimientos    │
│  👥  Contactos      │
│  ✂️  Servicios      │
│                     │
│  ───────────────    │
│  ⚙️  Configuración  │
│  👤  Mi perfil      │
│                     │
└─────────────────────────────┘
```

### Pages

**1. Dashboard / Caja**
- KPI cards at top:
  - Total Ingresos (sum of all service income)
  - Ingresos por método (efectivo / transferencia / pos)
  - Total Egresos / Gastos
  - Balance Efectivo en Caja (solo método efectivo)
  - Balance Global (todos los métodos)
- Quick action buttons: + Nuevo Movimiento, Ver Informes

**2. Movimientos (List)**
- Filter by: tipo (servicio/gasto/apertura/cierre), método de pago, fecha
- Each row shows: fecha, tipo, cliente/servicio, método, monto neto
- Tap to see detail

**3. Nuevo Movimiento (Form)**
- Step 1: Select type (Servicio / Gasto / Apertura / Cierre)
- Step 2: Fields change based on type:
  - **Servicio**: Contact (search/select), Service (dropdown with price), Payment method (efectivo/transferencia/pos), Amount received (if efectivo), Change given (auto-calculated)
  - **Gasto**: Description, Amount, Source (Caja / Cta Bancaria)
  - **Apertura**: Amount (same as initial capital)
  - **Cierre**: Amount, Destination (Caja / Cta Bancaria)

**4. Contactos**
- Searchable list
- Add/Edit contact: name, CI, phone, comment
- Tap contact → history of services

**5. Servicios**
- List of services with prices
- Add/Edit service: name, price
- Note: "Corte y barba", "Corte y ceja" found in data but not in service list — should be added

---

## Auth & Permissions

| Action | Admin | Barber |
|--------|-------|--------|
| Ver dashboard/kpis | ✓ | ✓ |
| Registrar movimiento | ✓ | ✓ |
| Ver historial movimientos | ✓ | ✓ (own only?) |
| Crear/editar servicios | ✓ | ✗ |
| Crear/editar contactos | ✓ | ✓ |
| Ver informes detallados | ✓ | Limited |
| Arqueo / Cierre de caja | ✓ | ✗ |

*Note: User to confirm if barbers can see all movements or only their own.*

---

## Technical Decisions

### Decision: Store amounts as INTEGER (guaranies)
**Choice**: Prices in G, no decimals needed. PostgreSQL INTEGER handles this perfectly.
**Rationale**: Guaraní doesn't have subunit (no cents), avoids float precision issues.

### Decision: payment_method only on servicio movements
**Choice**: Gasto/Apertura/Cierre don't have payment_method field (stored in comment or ignored).
**Rationale**: These types don't involve the three-way split — gasto comes from "caja" or "cta bancaria" as a comment, not as a payment method choice.

### Decision: Service price stored on movement
**Choice**: When registering a service, the price at that moment is stored in `amount_charged`.
**Rationale**: Service prices may change over time; historical movements should reflect the price at the time of sale.

---

## Visual Design

| Aspect | Decision |
|--------|----------|
| **Aesthetic** | Modern minimalist, B&W (black & white) |
| **Primary colors** | Black `#000`, White `#FFF` |
| **Accent** | Grays for hierarchy (`#333`, `#666`, `#999`, `#EEE`) |
| **Typography** | Sans-serif, clean (Inter or system font) |
| **Layout** | Generous whitespace, no clutter |
| **Icons** | Line icons (lucide-react) — introduced for the theme toggle in the drawer; a full icon rollout across pages is a separate, later change |
| **Borders/shadows** | Subtle, minimal; shadows are light-mode only (see Theming System) |

### Theming System

Introduced by the "design-tokens-and-dark-mode" change. Hand-rolled (no `next-themes` dependency).

**Semantic tokens** (`src/app/globals.css`) layer on top of the raw `--black`/`--white`/`--gray-*` ramp: `--surface`, `--surface-elevated`, `--border`, `--text-primary/secondary/muted`, `--accent(-hover/-foreground/-subtle)`, `--danger(-subtle)`, `--warning(-subtle)`, `--shadow-sm/md/lg`. Light values live on `:root`. Existing pages that don't consume these tokens yet are unaffected — they keep rendering off the raw ramp.

**Dark mode**: dark values live under `[data-theme="dark"]` (explicit override) and are mirrored under `@media (prefers-color-scheme: dark)` scoped to `:root:not([data-theme])` (system-default fallback, no explicit choice made). Elevation in dark mode comes from a lighter surface tint + border, not a shadow (`--shadow-*` resolve to `none`) — shadows read poorly against dark backgrounds.

**Accent presets**: 8 curated brand accents selectable via `business_settings.brand_color` (`slate` default, `emerald`, `blue`, `violet`, `rose`, `amber`, `teal`, `pink`), each a `[data-accent="KEY"]` block defining `--accent/-hover/-foreground/-subtle` for both light and dark, with `--accent-foreground` chosen for AA contrast against `--accent`.

**No-flash mechanism**: a blocking inline script (`next/script strategy="beforeInteractive"`, `src/app/layout.tsx`) reads cached `localStorage.theme` / `localStorage.brand_color` and stamps `data-theme` / `data-accent` on `<html>` before hydration. `ThemeContext` (`src/contexts/ThemeContext.tsx`) exposes the current theme + setter to the app; the toggle lives in the hamburger drawer. Dark/light is a personal, client-only preference (`localStorage`, no server persistence). `brand_color` is business-wide and DB-backed (`business_settings.brand_color`, additive column, admin-editable from `/settings`); `SettingsContext` reconciles the localStorage-cached value with the DB value once it loads (DB wins).

**Toggle component fix**: `src/components/Toggle.tsx` is an accessible custom switch (`role="switch"`, `aria-checked`, Space/Enter keyboard support) that replaced the four native `input[type=checkbox]` fields on `/settings`. Root cause of the old rendering bug: the global `button, a, input, select, textarea { min-height: 44px; min-width: 44px }` rule (kept for touch-target accessibility on real form controls) was stretching native checkboxes past their intended 20×20 size, producing the inconsistent "blue-filled looks-checked" rendering. `Toggle` renders as a `<button>` with its own `.toggle` class, which — as a class selector — outranks the plain-element `button` selector on specificity, so it is never subject to that rule.

### Mobile-First UI Principles

- Touch targets minimum 44px (native form elements; dedicated components like `Toggle` intentionally opt out where a smaller control is the correct affordance — see Theming System)
- Hamburger + drawer navigation, reachable top-left
- Forms optimized for thumb typing
- No horizontal scrolling
- Cards with ample padding
- Contrast high for readability

```
villcan/
├── app/
│   ├── layout.tsx           # Root layout: hamburger drawer nav + theme-init script
│   ├── page.tsx              # Dashboard / Caja
│   ├── movements/
│   │   ├── page.tsx          # List of movements
│   │   └── new/page.tsx      # New movement form
│   ├── contacts/
│   │   ├── page.tsx          # List of contacts
│   │   └── [id]/page.tsx     # Contact detail/history
│   ├── services/
│   │   └── page.tsx          # Services list + CRUD
│   └── api/
│       ├── movements/route.ts
│       ├── contacts/route.ts
│       └── services/route.ts
├── components/
│   ├── BottomNav.tsx
│   ├── KPICard.tsx
│   ├── MovementForm.tsx
│   └── ...
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── utils.ts
└── types/
    └── index.ts
```

---

## Open Questions

- [ ] Can barbers see all movements or only their own?
- [ ] Should we track which user performed each movement?
- [ ] Any need for offline support / sync?
- [ ] Export reports to PDF/CSV?
- [ ] Do we need image upload for any flow (AppSheet had images)?