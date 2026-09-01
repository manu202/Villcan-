import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { GastronomyTemplate } from '@/components/storefront/templates/GastronomyTemplate';
import { RetailTemplate } from '@/components/storefront/templates/RetailTemplate';
import { ServicesTemplate } from '@/components/storefront/templates/ServicesTemplate';
import type { Branch, Service } from '@/types';

export const revalidate = 60;

interface StorefrontPageProps {
  params: Promise<{ slug: string }>;
}

// Anon RLS (branches_public_select_storefront, services_public_select — see
// supabase/migrations/20260831140000_storefront.sql) already scopes this to
// storefront_enabled+is_active branches and active+available services, so an
// empty/missing branch here means exactly the two "not available" scenarios
// from spec.md: unknown/inactive slug, or storefront_enabled = false.
async function getBranchBySlug(slug: string): Promise<Branch | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('branches').select('*').eq('slug', slug).maybeSingle();
  return (data as Branch | null) ?? null;
}

export async function getCatalog(branchId: string): Promise<Service[]> {
  const supabase = await createClient();
  // Services with branch_id = NULL are global (visible on every branch) —
  // same convention used everywhere else in the app (ServiceForm.tsx's
  // isGlobal checkbox, create_storefront_order's `branch_id = v_branch.id
  // or branch_id is null` check). This page is the only place that used to
  // filter with a plain `.eq('branch_id', branchId)`, which silently
  // excluded every global service from the public catalog.
  const { data } = await supabase
    .from('services')
    .select('*')
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .eq('is_active', true)
    .eq('is_available', true)
    .order('category')
    .order('name');
  return (data as Service[]) ?? [];
}

export async function generateMetadata({ params }: StorefrontPageProps): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  return {
    title: branch ? `${branch.name} — Villcan` : 'Tienda no disponible',
  };
}

export default async function StorefrontPage({ params }: StorefrontPageProps) {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);

  if (!branch) {
    return (
      <div className="storefront-unavailable">
        <h1>Tienda no disponible</h1>
        <p>Este enlace no corresponde a ninguna tienda activa.</p>
        <style>{`
          .storefront-unavailable {
            max-width: 480px;
            margin: 80px auto;
            text-align: center;
            padding: 24px;
          }
          .storefront-unavailable h1 {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .storefront-unavailable p {
            color: var(--text-secondary);
          }
        `}</style>
      </div>
    );
  }

  const services = await getCatalog(branch.id);

  // Each business vertical gets a purpose-built template — same shared cart
  // hook underneath (see useStorefrontCart), only the presentation differs
  // (see spec.md "Plantillas por rubro"). barbershop and any unrecognized/
  // future vertical value fall back to ServicesTemplate.
  if (branch.vertical === 'gastronomy') {
    return <GastronomyTemplate branch={branch} services={services} />;
  }

  if (branch.vertical === 'retail') {
    return <RetailTemplate branch={branch} services={services} />;
  }

  return <ServicesTemplate branch={branch} services={services} />;
}
