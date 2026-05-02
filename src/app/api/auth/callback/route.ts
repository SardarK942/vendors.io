import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/dashboard';

  if (code) {
    const cookieStore = await cookies();
    // Cookie set by signup page before signInWithOAuth — survives the OAuth
    // round-trip even when the Supabase auth proxy strips URL query params.
    // Falls back to ?signup_role= for backward compat with older client builds.
    const cookieRole = cookieStore.get('signup_role')?.value;
    const queryRole = searchParams.get('signup_role');
    const signupRole =
      cookieRole === 'couple' || cookieRole === 'vendor'
        ? cookieRole
        : queryRole === 'couple' || queryRole === 'vendor'
          ? queryRole
          : null;

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    console.log('[auth/callback]', {
      url: request.url,
      signupRole,
      roleSource: cookieRole ? 'cookie' : queryRole ? 'query' : 'none',
      userId: data?.user?.id,
      userCreatedAt: data?.user?.created_at,
      ageMs: data?.user?.created_at ? Date.now() - new Date(data.user.created_at).getTime() : null,
      exchangeError: error?.message ?? null,
    });
    if (!error) {
      if (
        data?.user &&
        signupRole &&
        Date.now() - new Date(data.user.created_at).getTime() < 60_000
      ) {
        const { error: updErr } = await supabase
          .from('users')
          .update({ role: signupRole })
          .eq('id', data.user.id);
        console.log('[auth/callback] role update result', {
          signupRole,
          userId: data.user.id,
          error: updErr?.message ?? null,
        });
      }
      // Clear the one-shot signup_role cookie regardless of outcome.
      if (cookieRole) {
        cookieStore.set('signup_role', '', { path: '/', maxAge: 0 });
      }
      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
