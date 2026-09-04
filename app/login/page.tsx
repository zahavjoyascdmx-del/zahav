import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="card">
        <h1>ZAHAV</h1>
        <p className="muted" style={{ marginTop: 0 }}>ERP · inventario y ventas</p>
        {error && <p className="error">Correo o contraseña incorrectos.</p>}
        <form action={signIn} className="form">
          <input name="email" type="email" placeholder="Correo" autoComplete="email" required />
          <input name="password" type="password" placeholder="Contraseña" autoComplete="current-password" required />
          <button className="btn" type="submit">Entrar</button>
        </form>
      </div>
    </main>
  );
}
