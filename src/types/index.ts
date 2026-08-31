// Database types for Villcan - matches Supabase schema

export type PaymentMethod = 'efectivo' | 'transferencia' | 'pos';

export type MovementType = 'servicio' | 'gasto' | 'apertura' | 'cierre';

export type BusinessVertical = 'barbershop' | 'gastronomy' | 'generic';

// `role` was removed (bug #4 - profiles.role was dead code; the real,
// per-branch authorization source of truth is UserBranchAccess.role).
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  vertical: BusinessVertical;
  created_at: string;
  // Public storefront (public-storefront capability). storefront_enabled
  // defaults false in the DB — the feature ships OFF per branch, a kill
  // switch that needs no code revert (see design "Rollout"). Optional here
  // (not `| null`) because most existing queries select an explicit column
  // list that predates these columns — only code that actually selects them
  // (getUserBranches, the storefront page/settings) needs to populate them.
  slug?: string | null;
  whatsapp_number?: string | null;
  storefront_enabled?: boolean;
}

export interface UserBranchAccess {
  user_id: string;
  branch_id: string;
  role: 'admin' | 'barber' | 'viewer';
  created_at: string;
}

export interface BranchWithRole extends Branch {
  user_role: 'admin' | 'barber' | 'viewer';
}

export interface Service {
  id: string;
  name: string;
  price: number; // stored as integer (guaranies)
  cost: number | null; // stored as integer (guaranies), NULL/0 = unknown/no cost tracked
  created_at: string;
  is_active: boolean;
  branch_id: string | null; // NULL = global
  // Public storefront catalog metadata (added alongside orders/order_items).
  // Optional for the same reason as Branch's storefront fields above —
  // existing services queries select an explicit column list.
  description?: string | null;
  image_url?: string | null;
  category?: string | null;
  is_available?: boolean;
}

export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  branch_id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  contact_id: string | null;
  note: string | null;
  status: OrderStatus;
  total: number;
  whatsapp_message: string;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  service_id: string;
  name_snapshot: string;
  unit_price: number;
  qty: number;
  line_total: number;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

// Input shape for public.create_storefront_order — the client never sends
// prices; the RPC recalculates unit_price/total server-side from the current
// `services` rows (spec "Client-supplied price is ignored/rejected").
export interface StorefrontOrderItemInput {
  service_id: string;
  qty: number;
}

export interface CreateStorefrontOrderInput {
  p_slug: string;
  p_customer_name: string;
  p_customer_phone: string;
  p_customer_email?: string | null;
  p_note?: string | null;
  p_items: StorefrontOrderItemInput[];
}

export interface CreateStorefrontOrderResult {
  order_id: string;
  order_code: string;
  total: number;
  whatsapp_number: string | null;
  whatsapp_message: string;
  items: Array<{ name: string; qty: number; unit_price: number; line_total: number }>;
}

export interface Contact {
  id: string;
  full_name: string;
  ci: string | null;
  phone: string | null;
  comment: string | null;
  created_at: string;
}

export interface Movement {
  id: string;
  type: MovementType;
  amount_charged: number | null; // price of service (only for tipo=servicio)
  commission_pct: number | null; // frozen at insert (only for tipo=servicio, when commissions_enabled=true)
  income: number; // money coming in
  expense: number; // money going out (change given, expenses, etc.)
  payment_method: PaymentMethod | null; // only for tipo=servicio
  contact_id: string | null;
  service_id: string | null;
  user_id: string;
  branch_id: string; // ADDED - REQUIRED
  comment: string | null;
  created_at: string;
}

// Extended types for UI (joined data)
export interface MovementWithDetails extends Movement {
  contact?: Contact;
  service?: Service;
  user?: Profile;
}

// Form data for creating movements
export interface MovementFormData {
  type: MovementType;
  amount_charged?: number;
  income: number;
  expense: number;
  payment_method?: PaymentMethod;
  contact_id?: string;
  service_id?: string;
  comment?: string;
}

export interface BusinessSettings {
  id: number;
  commissions_enabled: boolean;
  default_commission_pct: number;
  split_payment_enabled: boolean;
  mandatory_arqueo_enabled: boolean;
  inventory_enabled: boolean;
  services_label: string;
  staff_label: string;
  brand_color: string;
  updated_at: string;
  updated_by: string | null;
}

// Cerrar Caja (arqueo) — new, additive, decoupled from the `cierre` movement type.
export interface CashClosing {
  id: string;
  branch_id: string;
  closed_by: string;
  period_start: string;
  closed_at: string;
  arqueo_enabled: boolean;
  calculated_efectivo: number;
  calculated_transferencia: number;
  calculated_pos: number;
  calculated_total: number;
  counted_efectivo: number | null;
  counted_transferencia: number | null;
  counted_pos: number | null;
  discrepancy_efectivo: number | null;
  discrepancy_transferencia: number | null;
  discrepancy_pos: number | null;
  notes: string | null;
  created_at: string;
}

// Amounts per payment method, used both for calculated (system) balances
// and counted (physical) balances during an arqueo.
export interface ArqueoAmounts {
  efectivo: number;
  transferencia: number;
  pos: number;
}

// Per-method discrepancy = counted - calculated.
export type ArqueoDiscrepancy = ArqueoAmounts;

export interface ClientError {
  id: string;
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  user_id: string | null;
  branch_id: string | null;
  created_at: string;
}

// KPI data structures live in src/lib/kpis.ts as PeriodActivity (period-scoped
// Ingresos/Egresos, driven by the Hoy/Semana/Mes toggle) and RunningBalance
// (always-current Balance en Efectivo / Balance Global, NOT period-scoped) —
// split deliberately so the dashboard toggle cannot accidentally affect the
// running balance. Previously a single merged CashBoxKPIs type lived here.