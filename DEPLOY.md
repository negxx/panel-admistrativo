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
| `DATABASE_URL` | Pooler en modo **sesión**, puerto `5432` | La aplicación |
| `DIRECT_URL` | Pooler en modo **sesión**, puerto `5432` (la misma cadena) | Crear tablas y migrar |

Los dos van por el pooler (`...pooler.supabase.com`), en modo **sesión**. **No
uses el modo transacción (puerto `6543`) para `DATABASE_URL`**, aunque sea la
opción que Supabase marca por defecto para apps: en modo transacción el
pooler puede cambiar el backend de Postgres entre una consulta y la
siguiente, y esta app manda varias consultas en paralelo por request (tRPC
batching — cualquier pantalla que pida varias cosas juntas). Con eso, la
conexión se queda colgada para siempre, sin error ni timeout: las pantallas
cargan sin mostrar nunca los datos. Modo sesión no tiene ese problema porque
cada conexión tiene un backend fijo mientras dura.

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
| `DATABASE_URL` | La del **pooler en modo sesión** (5432) — no la de 6543 |
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

## 7. Cerrar la API REST de Supabase (importante)

Supabase publica **todas las tablas** por una API REST propia, accesible con la
clave *publishable*, que por diseño es pública y viaja en el navegador. Este
sistema no usa esa API —se conecta directo a Postgres— pero la puerta queda
abierta igual: sin protección, cualquiera puede leer el padrón completo con
nombres y DNIs de menores, teléfonos de las familias y todos los pagos.

Ya está resuelto en el código: la migración `0001_habilita_rls.sql` activa Row
Level Security en todas las tablas y le quita los permisos a los roles de la API.
Se aplica sola con `npm run db:migrate`.

Comprobalo desde afuera (tiene que devolver 401):

```bash
curl "https://TU-PROYECTO.supabase.co/rest/v1/players?select=*"   -H "apikey: TU_CLAVE_PUBLISHABLE"
```

La aplicación no se ve afectada: se conecta con el rol `postgres`, que es dueño
de las tablas y omite RLS.

**Recomendado además:** en Supabase → Settings → Data API, desactivá la API por
completo. Si el proyecto no la usa, apagarla elimina la superficie de ataque en
vez de solo protegerla.

Cuando agregues tablas nuevas, acordate de habilitarles RLS. El **Advisor** de
Supabase avisa si alguna queda sin protección.

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

**Las pantallas se quedan cargando y nunca muestran datos, sin ningún error en
la consola** — `DATABASE_URL` está apuntando al pooler en modo **transacción**
(puerto `6543`) en vez de modo **sesión** (`5432`). Es el problema más común y
el más difícil de notar porque no tira ningún error: la conexión simplemente
se cuelga para siempre la primera vez que una pantalla dispara más de una
consulta en paralelo (algo que pasa todo el tiempo con tRPC). Cambiá el puerto
a `5432` en `DATABASE_URL`, tanto en tu `.env` como en Vercel.

**`db:migrate` falla** — las migraciones necesitan `DIRECT_URL`, que también
tiene que ser el pooler en modo sesión (`5432`), no la conexión directa a
Postgres.

**"Max clients reached"** — `DATABASE_URL` o `DIRECT_URL` apuntan a la conexión
directa de verdad (`db.xxxx.supabase.co`, la que requiere IPv6) en vez del
pooler. En serverless hay que usar el pooler sí o sí.

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
