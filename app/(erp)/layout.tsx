import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { Nav } from "@/components/Nav";

export default async function ErpLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">ZAHAV<small>ERP · JOYAS CDMX</small></div>
        <Nav />
        <div className="spacer" />
        <div className="user">{user?.email}</div>
        <form action={signOut}><button type="submit">Salir</button></form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
