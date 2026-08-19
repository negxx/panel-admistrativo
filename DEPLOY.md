# Puesta en producción — Supabase + Vercel

Todo lo que hace falta para dejar el sistema online, **gratis**.

- **Supabase** — la base de datos (Postgres). Plan gratuito: 500 MB.
- **Vercel** — el hosting del sitio y la API. Plan gratuito, HTTPS incluido.

Con las dos cuentas alcanza; no hace falta tarjeta ni dominio propio.

**Se pueden agregar a una cuenta que ya tenga otros proyectos.** Vercel permite
proyectos ilimitados en el plan gratuito; Supabase permite **2 activos por
organización**, así que si ya tenés uno, este entra como el segundo. Nada se
mezcla: cada proyecto está aislado.

---

## 1. Crear la base en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto.
2. Elegí la región más cercana (South America si está disponible).
3. Guardá la contraseña de la base: la vas a necesitar y no se puede volver a ver.

Después andá a **Project Settings → Database → Connection string** y copiá **dos**
cadenas distintas. Esto es importante y es la causa más común de que algo no
funcione:

Buscá la pestaña **ORMs** (no "App Frameworks": esa te da las claves del SDK de
JavaScript, que este proyecto no usa — se conecta directo a Postgres con Drizzle).

| Variable | Cuál copiar | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | Pooler en modo **transacción**, puerto `6543` | La aplicación |
| `DIRECT_URL` | Pooler en modo **sesión**, puerto `5432` | Crear tablas y migrar |

Los dos van por el pooler (`...pooler.supabase.com`). El modo transacción
multiplexa conexiones, que es lo que necesita serverless, pero no soporta las
sentencias que crean tablas; para eso está el modo sesión.

> **No uses la "Direct connection"** (`db.xxxx.supabase.co:5432`) aunque aparezca
> en el panel: requiere IPv6 y suele fallar desde conexiones hogareñas.

Poné las dos en tu `.env` local, reemplazando `[YOUR-PASSWORD]` por la contraseña
de la base. Si la contraseña tiene `@ # / : ?`, hay que escaparlos — es más simple
resetearla y usar sólo letras y números.

**Sacale el `?pgbouncer=true`** a `DATABASE_URL` si viene: ese flag es de Prisma.
Acá el driver es `postgres-js`, ya configurado con `prepare: false` en el código.

Generá el secreto de sesión:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. Crear las tablas

```bash
npm run db:migrate
```

Si es una instalación desde cero y querés datos de ejemplo:

```bash
npm run db:seed
```

## 3. Importar los datos del club

Si ya venías usando el sistema con SQLite:

```bash
npm run db:import
```

Copia todo respetando los ids, y al final ajusta los contadores de Postgres para
que el próximo alta no choque con un id existente. **Las contraseñas y los PIN se
copian tal cual**: nadie tiene que volver a activar su acceso.

Es repetible: si algo sale mal, corregís y lo volvés a correr.

## 4. Publicar en Vercel

1. Subí el proyecto a GitHub.
2. En [vercel.com](https://vercel.com), **Add New → Project** e importá el repo.
3. En **Root Directory** poné `app`.
4. Cargá las variables de entorno:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La del **pooler** (6543) |
| `APP_SECRET` | El secreto que generaste |
| `CRON_SECRET` | Otro secreto aleatorio, para el mantenimiento diario |

Con esas tres alcanza. `DIRECT_URL` no hace falta en Vercel (las migraciones se
corren desde tu máquina) y las del OAuth de Kimi tampoco: es una vía opcional y,
si no están, el botón "Ingresar con Kimi" ni aparece.

5. **Deploy**.

Queda en `https://tu-proyecto.vercel.app`.

## 5. Los dos subdominios

Acá está lo bueno: **Vercel deja crear varios proyectos desde el mismo
repositorio**. No hay que duplicar código ni mantener dos ramas. Dos proyectos
apuntando al mismo repo y a la misma base:

| Proyecto | URL | Para |
| --- | --- | --- |
| `club` | `club.vercel.app` | Familias |
| `club-admin` | `club-admin.vercel.app` | Secretaría |

Los dos comparten `DATABASE_URL`, así que ven exactamente los mismos datos. La
única diferencia es qué link le pasás a cada grupo. No hay nada que sincronizar.

Si más adelante comprás un dominio, en **Settings → Domains** de cada proyecto
apuntás `club.tudominio.com` y `admin.tudominio.com`. Es un cambio de DNS: para
el club, transparente.

## 6. Arranque en frío: mantenerlo despierto

En el plan gratuito, tras un rato sin uso la primera petición paga el arranque de
**dos** cosas: la función de Vercel y la base de Supabase. Puede tardar entre
varios segundos y agotar el tiempo. La segunda petición ya responde en menos de
un segundo.

Qué hace el sistema al respecto:

- La conexión a la base se recicla seguido, para no reutilizar una que quedó
  muerta mientras la función estaba congelada (eso colgaba la consulta para
  siempre en vez de fallar).
- El frontend **reintenta** ante fallas de red y errores del servidor, incluidas
  las mutaciones. Sin eso, la primera persona del día se encontraba con un login
  que fallaba sin explicación.
- La pantalla de login avisa "Despertando el servidor…" si tarda más de 3
  segundos, para que no parezca colgado.

**Lo que más ayuda es un ping periódico.** El cron de `vercel.json` corre una vez
por día (es el máximo del plan gratuito), así que conviene agregar uno externo
gratuito desde [cron-job.org](https://cron-job.org), cada 10 minutos, a:

```
https://tu-proyecto.vercel.app/api/trpc/ping
```

Con eso el club casi nunca se topa con el arranque en frío. Además evita que
Supabase pause el proyecto por inactividad.

---

## Antes de que entre la primera familia

| Qué | Dónde |
| --- | --- |
| Cambiar la contraseña de `admin` | Configuración → Mi contraseña |
| Cargar CBU, alias y titular reales | Configuración → Datos de cobro |
| Revisar los montos de las categorías | Categorías |
| Crear un usuario por persona de secretaría | Usuarios |
| Definir interés por mora y días de gracia | Configuración |

**Sugerencia de arranque:** usá sólo el CRM con la secretaría una o dos semanas
—cobros, generación del mes, cierre de caja— y recién después pasales el link del
portal a tres o cuatro familias de confianza. Si el portal se abre a todos el día
uno y algo falla, la confianza cuesta recuperarla.

---

## Alternativa: servidor común (Railway, Fly, VPS, Docker)

El proyecto también corre como un servidor Node normal, sin serverless:

```bash
npm run build     # compila el sitio y empaqueta el servidor
npm start         # levanta en el puerto PORT (3000 por defecto)
```

`server/serve.ts` es el arranque para ese caso y `api/index.ts` el de Vercel: los
dos montan la misma app, así que se puede cambiar de hosting sin tocar el backend.
Con esta variante seguís necesitando un Postgres — puede ser el mismo de Supabase.

---

## Problemas frecuentes

**"Falta DATABASE_URL"** — no cargaste la variable en Vercel, o la cargaste sólo
en Preview y no en Production.

**Errores raros e intermitentes en las consultas** — estás usando la conexión
directa (5432) en vez del pooler (6543) en `DATABASE_URL`.

**`db:migrate` falla** — al revés: las migraciones necesitan `DIRECT_URL` (5432),
no el pooler.

**"Max clients reached"** — `DATABASE_URL` apunta a la conexión directa. En
serverless hay que usar el pooler sí o sí.

**El cron no corre** — falta `CRON_SECRET` en Vercel, o no coincide. Los crons del
plan gratuito corren una vez por día, no más seguido.

**`FUNCTION_INVOCATION_FAILED` en todos los endpoints** — el adaptador de Hono
equivocado. En un proyecto Vercel sin Next.js hay que usar
`@hono/node-server/vercel`, no `hono/vercel` (ese es para Next.js App Router y
devuelve un handler con firma Web, mientras que Vercel invoca las funciones con
la firma `(req, res)` de Node).

**El sitio carga pero toda la API devuelve 500** — casi siempre es una variable
de entorno obligatoria que falta: el servidor se cae al importar, antes de
atender nada. Miralo en Vercel → Deployments → la función → Runtime Logs; el
error dice qué variable falta. Sólo `APP_SECRET` y `DATABASE_URL` son
obligatorias.
