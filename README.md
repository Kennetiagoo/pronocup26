# Prono Global 2026

Aplicacion web de pronosticos del Mundial 2026 hecha con Next.js + Prisma.

## Caracteristicas

- Login y registro basico por correo + contrasena.
- Fixture completo del Mundial 2026 (104 partidos).
- Pronostico por partido para cada usuario.
- Banderas dinamicas por pais.
- Tabla de posiciones global.
- Panel admin para:
  - cambiar reglas de puntaje,
  - bloquear o abrir registro publico,
  - cargar resultados oficiales y recalcular puntajes.

## Fuente del fixture

- Fixture base extraido desde la pagina de Wikipedia del Mundial 2026 usando API parse:
  - `https://en.wikipedia.org/w/api.php?action=parse&page=2026_FIFA_World_Cup&prop=text&format=json`
- Referencia oficial del calendario FIFA (104 partidos):
  - `https://inside.fifa.com/organisation/media-releases/updated-world-cup-2026-match-schedule-venues-kick-off-times-104-matches`
  - PDF: `https://digitalhub.fifa.com/asset/4b5d4417-3343-4732-9cdf-14b6662af407/FWC26-Match-Schedule_English.pdf`

## Requisitos

- Node.js 20+
- Base de datos PostgreSQL (Neon recomendado para Vercel)

## Configuracion local

1. Instalar dependencias:

```bash
npm install
```

2. Crear variables de entorno:

```bash
cp .env.example .env
```

3. Editar `.env` con:

- `DATABASE_URL`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (si activas acceso con Google)
- (opcional) `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`

4. Generar cliente Prisma y crear tablas:

```bash
npm run prisma:generate
npm run db:push
```

5. (Opcional) refrescar fixture desde la fuente:

```bash
npm run fixture:refresh
```

6. Cargar datos iniciales (reglas, admin y partidos):

```bash
npm run db:seed
```

7. Levantar app:

```bash
npm run dev
```

## Credenciales admin iniciales

Por defecto:

- Email: `admin@prono2026.com`
- Contrasena: `admin123`

Cambia estas variables en `.env` y vuelve a ejecutar seed si deseas otro admin.

## Deploy en Vercel

1. Crea un proyecto en Vercel y conecta este repositorio.
2. Provisiona Postgres (Neon o externo) y agrega variables:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_NAME`
3. Build command: `npm run build`
4. Install command: `npm install`
5. Despues del primer deploy, ejecuta una vez:
   - `npm run db:push`
   - `npm run db:seed`

## Scripts utiles

- `npm run fixture:refresh`: vuelve a descargar y generar fixture.
- `npm run db:push`: aplica esquema Prisma.
- `npm run db:seed`: inserta admin, reglas y partidos.
- `npm run dev`: entorno local.
- `npm run build`: build de produccion.
