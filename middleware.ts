import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // getClaims valida el JWT localmente (sin viaje a Supabase en cada página).
    const { data } = await supabase.auth.getClaims();
    const logged = Boolean(data?.claims?.sub);
    const isLogin = request.nextUrl.pathname.startsWith("/login");
    if (!logged && !isLogin) return NextResponse.redirect(new URL("/login", request.url));
    if (logged && isLogin) return NextResponse.redirect(new URL("/", request.url));
    return response;
  } catch (e) {
    return new NextResponse(`Error de autenticación: ${String(e)}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export const config = {
  matcher: ["/((?!compartir/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
