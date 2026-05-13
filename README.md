# Villcan — Barber Shop Cash Management

Mobile-first app for managing barbershop cash register movements.

## Tech Stack

- **Frontend**: Next.js 14 (App Router, PWA)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Deploy**: Vercel
- **Styling**: Tailwind CSS + custom CSS variables

## Features

- **Caja (Dashboard)**: KPIs for cash box balance
- **Movimientos**: Cash movement history and registration
- **Contactos**: Client management with CI and phone
- **Servicios**: Service catalog with prices

## Getting Started

### 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL schema in `supabase-schema.sql`
3. Copy your project URL and anon key

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run development server

```bash
npm run dev
```

## Database Schema

See `supabase-schema.sql` for complete schema including:
- `profiles` — user accounts with roles (admin/barber)
- `services` — service catalog with prices
- `contacts` — client contacts
- `movements` — cash register movements

### Movement Types

| Type | Description |
|------|-------------|
| `servicio` | Service sale — records income and change (expense) |
| `gasto` | Expense — money leaving the register |
| `apertura` | Opening capital for the shift |
| `cierre` | Cash extraction/deposit |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard / Caja
│   ├── movements/         # Movement list and new movement form
│   ├── contacts/          # Contact list
│   └── services/          # Services list
├── components/            # Reusable components
│   ├── HamburgerMenu.tsx # Navigation drawer
│   ├── KPICard.tsx       # KPI display card
│   └── MovementForm.tsx  # Movement registration form
├── lib/
│   ├── supabase/         # Supabase client setup
│   └── utils.ts           # Utility functions
└── types/
    └── index.ts           # TypeScript type definitions
```

## Design

- **Aesthetic**: Black & white minimal
- **Navigation**: Hamburger menu (top-left) with full-screen modules
- **Mobile-first**: Optimized for thumb reach, 44px touch targets# Villcan-
