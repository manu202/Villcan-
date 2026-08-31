import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { StorefrontClient } from '@/components/storefront/StorefrontClient';
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

async function getCatalog(branchId: string): Promise<Service[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('services')
    .select('*')
    .eq('branch_id', branchId)
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

  return (
    <div className="storefront-page">
      <header className="storefront-header">
        <h1>{branch.name}</h1>
      </header>
      <StorefrontClient branch={branch} services={services} />

      <style>{`
        .storefront-page {
          max-width: 480px;
          margin: 0 auto;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .storefront-header {
          padding: 24px 20px;
          border-bottom: 1px solid var(--border);
        }
        .storefront-header h1 {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
