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

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<InviteRequestBody>;
  const { email, role, branch_id } = body;

  if (!email || !role || !branch_id) {
    return Response.json(
      { error: 'email, role and branch_id are required' },
      { status: 400 }
    );
  }

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
    { redirectTo: `${new URL(request.url).origin}/login` }
  );

  let userId: string | undefined = inviteData?.user?.id;
  let invited = true;

  if (inviteError) {
    if (!isEmailExistsError(inviteError)) {
      return Response.json({ error: inviteError.message }, { status: 500 });
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
    return Response.json({ error: upsertError.message }, { status: 500 });
  }

  return Response.json({ user_id: userId, invited }, { status: 200 });
}
