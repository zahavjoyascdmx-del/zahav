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
