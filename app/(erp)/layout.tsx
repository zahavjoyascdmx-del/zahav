import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { Nav } from "@/components/Nav";
import { Logo } from "@/components/Logo";

export default async function ErpLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "";
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><Logo width={160} light /><small>ERP · JOYAS CDMX</small></div>
        <Nav />
        <div className="spacer" />
        <div className="user">{email}</div>
        <form action={signOut}><button type="submit">Salir</button></form>
      </aside>
      <div className="content">
        <header className="topbar">
          <div className="topbar-row">
            <Logo width={110} />
            <form action={signOut}><button type="submit" className="chip">Salir</button></form>
          </div>
          <nav className="topnav"><Nav /></nav>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
