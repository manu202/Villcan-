import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // A-11: this is a deliberate no-op, not an oversight. Real authorization
  // lives in Postgres RLS (every table/RPC checks auth.uid()/branch
  // membership server-side, see the SECURITY DEFINER functions and RLS
  // policies in supabase/migrations) -- that's the actual security boundary
  // regardless of which layer calls it. Client-side AuthGuard
  // (src/components/AuthGuard.tsx) only exists to avoid showing a confusing
  // empty page to a logged-out visitor; it is UX, not the security control.
  // A middleware-level redirect was avoided because reading Supabase's
  // cookie-based session reliably on Vercel's Edge runtime has known
  // reliability issues -- a false "logged out" edge redirect would be worse
  // than no redirect at all, given RLS already fails closed either way.
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};