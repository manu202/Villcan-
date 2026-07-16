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
  updated_at: string;
  updated_by: string | null;
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