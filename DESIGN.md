# Villcan — Barber Shop Cash Management App

## Context

A mobile-first app for a barbershop to manage cash register movements. The current AppSheet app works but is slow. Goal: rebuild with Next.js + Supabase for better performance.

## Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router, PWA) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Deploy | Vercel (free) |
| Styles | Tailwind CSS |

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

- **Hamburger menu** top-left corner (☰)
- **Full-screen modules** — each page takes 100% viewport, no bottom bar stealing space
- **Drawer overlay** — hamburger opens slide-in menu from left with navigation options

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
| **Icons** | Line icons only, no emoji |
| **Borders/shadows** | Subtle, minimal |

### Mobile-First UI Principles

- Touch targets minimum 44px
- Bottom tab navigation (easy thumb reach)
- Forms optimized for thumb typing
- No horizontal scrolling
- Cards with ample padding
- Contrast high for readability

```
villcan/
├── app/
│   ├── layout.tsx           # Root layout with bottom nav
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