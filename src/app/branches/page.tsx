import { redirect } from 'next/navigation';

// Old bookmarked route — Sucursales now lives under the Configuración hub.
export default function BranchesRedirectPage() {
  redirect('/settings/branches');
}
