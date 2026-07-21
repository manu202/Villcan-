// Database types for Villcan - matches Supabase schema

export type UserRole = 'admin' | 'barber';

export type PaymentMethod = 'efectivo' | 'transferencia' | 'pos';

export type MovementType = 'servicio' | 'gasto' | 'apertura' | 'cierre';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
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

// KPI data structure
export interface CashBoxKPIs {
  totalIncome: number;
  incomeByMethod: {
    efectivo: number;
    transferencia: number;
    pos: number;
  };
  totalExpenses: number; // gastos only (not service change)
  balanceEfectivo: number;
  balanceGlobal: number;
}