import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeEmail } from '@/lib/access';

// The service-role client below must never run at the edge.
export const runtime = 'nodejs';

interface InviteRequestBody {
  email: string;
  role: 'admin' | 'user';
  branch_id: string;
}

function isEmailExistsError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'email_exists') return true;
  return /already been registered|already exists/i.test(error.message ?? '');
}

// A-10: input validation used to be "truthy or bust" (any string accepted for
// email/role/branch_id) plus an unguarded request.json() that 500'd on
// malformed JSON. The DB's own CHECK constraint on user_branch_access.role
// already backstops an invalid role, but that surfaces as a raw Postgres
// constraint-violation error to the client -- see the generic error mapping
// below for why that matters.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ['admin', 'user'] as const;

function validateInviteBody(body: Partial<InviteRequestBody>): string | null {
  if (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email)) {
    return 'email inválido';
  }
  if (typeof body.role !== 'string' || !VALID_ROLES.includes(body.role as (typeof VALID_ROLES)[number])) {
    return `role debe ser uno de: ${VALID_ROLES.join(', ')}`;
  }
  if (typeof body.branch_id !== 'string' || body.branch_id.trim() === '') {
    return 'branch_id inválido';
  }
  return null;
}

export async function POST(request: Request) {
  let body: Partial<InviteRequestBody>;
  try {
    body = (await request.json()) as Partial<InviteRequestBody>;
  } catch {
    return Response.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 });
  }

  const validationError = validateInviteBody(body);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }
  const { email, role, branch_id } = body as InviteRequestBody;

  // 1. Authenticate the CALLER via their own session cookies (anon client).
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  // 2. Authorize: the caller must be admin of the target branch. Never trust
  // the request body for this — always check server-side via RLS-backed RPC.
  const { data: isAdmin, error: rpcError } = await supabase.rpc('is_branch_admin', {
    branch: branch_id,
  });

  if (rpcError || !isAdmin) {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const normalizedEmail = normalizeEmail(email);
  const admin = createAdminClient();

  // 3. Invite the new user. If the email already has an account, this is an
  // idempotent alta: find the existing user instead of failing.
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo: `${new URL(request.url).origin}/auth/set-password` }
  );

  let userId: string | undefined = inviteData?.user?.id;
  let invited = true;

  if (inviteError) {
    if (!isEmailExistsError(inviteError)) {
      console.error('[invite] inviteUserByEmail failed:', inviteError);
      return Response.json({ error: 'No se pudo enviar la invitación' }, { status: 500 });
    }

    invited = false;
    const { data: existingProfile, error: lookupError } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (lookupError || !existingProfile) {
      return Response.json(
        { error: 'El email ya está registrado pero no se encontró el usuario' },
        { status: 500 }
      );
    }
    userId = existingProfile.id;
  }

  if (!userId) {
    return Response.json({ error: 'No se pudo determinar el usuario invitado' }, { status: 500 });
  }

  // 4. Grant branch access in the same server-side operation.
  const { error: upsertError } = await admin
    .from('user_branch_access')
    .upsert({ user_id: userId, branch_id, role });

  if (upsertError) {
    console.error('[invite] user_branch_access upsert failed:', upsertError);
    return Response.json({ error: 'No se pudo otorgar el acceso a la sucursal' }, { status: 500 });
  }

  return Response.json({ user_id: userId, invited }, { status: 200 });
}
