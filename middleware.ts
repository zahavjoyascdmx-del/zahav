import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const faltan = [!url && "NEXT_PUBLIC_SUPABASE_URL", !key && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean).join(", ");
    return new NextResponse(
      `Faltan variables de entorno en Vercel: ${faltan}.\n` +
        `Agrégalas en Vercel > Settings > Environment Variables marcando Production, Preview y Development, y vuelve a desplegar.`,
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(url, key, {
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

    const { data: { user } } = await supabase.auth.getUser();
    const isLogin = request.nextUrl.pathname.startsWith("/login");
    if (!user && !isLogin) return NextResponse.redirect(new URL("/login", request.url));
    if (user && isLogin) return NextResponse.redirect(new URL("/", request.url));
    return response;
  } catch (e) {
    return new NextResponse(`Error de autenticación: ${String(e)}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
