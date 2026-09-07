# Zahav

Aplicación Next.js desplegada en Vercel y conectada a Supabase.

## Desarrollo local

```bash
cp .env.example .env.local   # rellena las variables de Supabase
npm install
npm run dev
```

## Variables de entorno

| Variable | Origen |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → anon / publishable key |

En Vercel se configuran en Project → Settings → Environment Variables.

## Permisos de Claude Code

`.claude/settings.json` define qué puede hacer Claude sin preguntar en cualquier sesión que use este repo:

- **Sin preguntar**: leer y editar archivos, `git`, `npm`, comandos de shell comunes y las herramientas de lectura de GitHub, Supabase, Vercel y Google Drive.
- **Siempre pregunta** (todo lo que toca Mercado Libre o producción): editar `supabase/functions/*` (meli-sync, meli-probe), `supabase/migrations/*` y `app/(erp)/sync/*`; ejecutar SQL, aplicar migraciones o desplegar edge functions en Supabase; desplegar, pausar o comprar en Vercel; hacer merge de PRs o escribir archivos directo en GitHub; `curl`, `rm` y la CLI de `supabase`/`vercel`.
- **Prohibido**: leer archivos `.env*` y hacer `git push --force`.

Para ajustar la lista, edita las secciones `allow`, `ask` y `deny` de ese archivo.
