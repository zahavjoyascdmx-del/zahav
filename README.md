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

## Videos con Higgsfield (Instagram y Mercado Libre)

La sección **Videos** convierte una foto de una publicación (o una foto subida a mano) en un video corto con la API de
[Higgsfield](https://cloud.higgsfield.ai) (modelo DoP, imagen → video), pensado para Reels de Instagram y Clips de Mercado Libre.

1. Crea una API key en cloud.higgsfield.ai y pégala en **Configuración → Higgsfield** con el formato `API_KEY:API_SECRET`.
   Se guarda en `private.sync_secrets` (clave `higgsfield_key`); solo la Edge Function la lee.
2. En **Videos** elige la publicación, la foto, una plantilla de prompt, el destino (IG / ML) y pulsa *Generar video*.
3. La Edge Function `higgsfield-video` envía la petición (`POST /v1/image2video/dop`), y un cron de Supabase
   (`higgsfield-poll`, cada 2 minutos mientras haya videos en proceso) consulta el estado. Al terminar, copia el MP4 al bucket
   público `videos` de Storage, porque el enlace de Higgsfield caduca en una hora.
4. Descarga el MP4 y súbelo a Instagram (Reel/historia) o a la publicación de Mercado Libre (Clips).

Piezas involucradas: `supabase/migrations/20260908_videos_higgsfield.sql` (tabla `videos`, bucket, RPCs `generar_video`,
`revisar_videos`, `higgsfield_set_key`, cron), `supabase/functions/higgsfield-video/index.ts`, `app/(erp)/videos/` y `lib/videos.ts`.

### Armar Reel para Instagram

En **Videos → Armar Reel** el clip de Higgsfield se convierte en un Reel de 15 s (1080×1920) con logo, título, ficha de la pieza,
"¿Sabías que?" y llamada a la acción. Las capas se dibujan con `@napi-rs/canvas` (`lib/reel/render.ts`) y se montan con `ffmpeg-static`
(`lib/reel/ffmpeg.ts`) en la ruta `app/(erp)/videos/[id]/reel` (POST arma el video, GET devuelve una vista previa PNG). El resultado se
guarda en `reels/` del bucket `videos`. El banco de datos curiosos está en `lib/reel/sabias.ts`; la ficha se sugiere desde la publicación
de ML y el catálogo (`lib/reel/ficha.ts`). Las fuentes (Playfair Display y Montserrat, licencia OFL) viven en `lib/reel/fonts/`.
