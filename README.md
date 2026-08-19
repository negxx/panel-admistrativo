# Sistema de gestión — Club de barrio

CRM para la secretaría del club (socios, cuotas, cobros, caja) **conectado con un
portal web** donde las familias consultan su deuda y avisan que pagaron. Lo que
informa el socio aparece en el panel para que alguien del club lo confirme, y
recién ahí la cuota figura como pagada.

---

## Índice

1. [Cómo levantarlo](#cómo-levantarlo)
2. [Cómo está organizado](#cómo-está-organizado)
3. [El circuito de cobro](#el-circuito-de-cobro)
4. [Reglas de negocio](#reglas-de-negocio)
5. [Seguridad](#seguridad)
6. [La base de datos](#la-base-de-datos)
7. [Tareas comunes](#tareas-comunes)
8. [Pendiente](#pendiente)

---

## Cómo levantarlo

Hace falta **Node 20 o superior** y una base PostgreSQL. Para desarrollo alcanza
con un proyecto gratuito de [Supabase](https://supabase.com).

```bash
npm install
```

Copiá `.env.example` a `.env` y completá las dos cadenas de conexión y el secreto
de sesión. Los pasos detallados están en **[DEPLOY.md](DEPLOY.md)**.

```bash
npm run db:migrate   # crea las tablas
npm run db:seed      # datos de ejemplo (opcional)
```

Si venís de la versión con SQLite, `npm run db:import` trae todos tus datos.

Después, a trabajar:

```bash
npm run dev
```

| Dirección                        | Qué es                          |
| -------------------------------- | ------------------------------- |
| `http://localhost:3000`          | Panel administrativo            |
| `http://localhost:3000/portal`   | Portal público de socios        |

Usuarios que crea el seed: `admin / admin123` y `secretaria / secre123`.
**Cambiá esas contraseñas antes de usarlo en el club.**

### Todos los comandos

| Comando              | Qué hace                                                       |
| -------------------- | -------------------------------------------------------------- |
| `npm run dev`        | Levanta frontend y API juntos, con recarga en caliente          |
| `npm run build`      | Compila el sitio y empaqueta el servidor en `dist/`             |
| `npm start`          | Corre lo compilado, en modo producción                          |
| `npm run check`      | Verifica tipos con TypeScript                                   |
| `npm run lint`       | Revisa estilo y errores comunes                                 |
| `npm test`           | Corre los tests                                                 |
| `npm run db:generate`| Genera una migración SQL a partir de cambios en `db/schema.ts`  |
| `npm run db:migrate` | Aplica las migraciones pendientes                               |
| `npm run db:push`    | Empuja el esquema sin migración (sólo para desarrollo)          |
| `npm run db:seed`    | **Borra todo** y carga datos de ejemplo                         |
| `npm run db:import`  | Importa una base SQLite vieja a Postgres                        |
| `npm run db:check`   | Verifica la conexión sin mostrar la contraseña                  |

---

## Cómo está organizado

```
app/
├── api/index.ts            Punto de entrada de Vercel (sólo este archivo)
├── server/                 Backend (Hono + tRPC)
│   ├── boot.ts             Define la app (no la pone a escuchar)
│   ├── serve.ts            Arranque para un servidor común
│   ├── router.ts           Índice de todos los endpoints
│   ├── context.ts          Resuelve quién hace cada request
│   ├── middleware.ts       Los cuatro niveles de acceso
│   ├── routers/            Un archivo por área del sistema
│   ├── domain/             ⭐ Reglas de negocio (lo importante)
│   │   ├── quotas.ts       Cuotas, mora, descuentos
│   │   ├── payments.ts     Cobros y confirmación de pagos
│   │   ├── cash.ts         Cierre de caja
│   │   ├── receipts.ts     Numeración de recibos
│   │   └── settings.ts     Configuración del club
│   └── lib/                Utilidades: fechas, hasheo, sesiones, límites
├── db/
│   ├── schema.ts           Definición de las tablas
│   ├── migrations/         Migraciones versionadas
│   └── seed.ts             Datos de ejemplo
├── contracts/              Constantes compartidas entre back y front
├── src/                    Frontend (React + Vite)
│   ├── pages/              Una pantalla por archivo
│   ├── components/         Piezas compartidas
│   └── lib/format.ts       Formato de plata, fechas y períodos
└── scripts/                Conexión, importación y arranque
```

**La lógica de negocio vive en `server/domain/`**, separada de los endpoints. Esa
carpeta es la que tiene tests y la que hay que mirar primero para entender cómo
funciona el club. Los `routers/` sólo validan lo que entra y arman la respuesta.

### Las pantallas

| Pantalla              | Para qué sirve                                                      |
| --------------------- | ------------------------------------------------------------------- |
| **Panel**             | Cómo viene el mes: cobrado, deuda, avisos pendientes                 |
| **Socios**            | Altas, bajas, ficha y deuda de cada chico                            |
| **Familias**          | Tutores, su deuda consolidada y acceso al portal                     |
| **Cuotas y pagos**    | Generar el mes, ver el estado de cada cuota, cobrar                  |
| **Pagos a confirmar** | Bandeja de lo que informaron los socios desde el portal              |
| **Deudores**          | Morosos y avisos por WhatsApp                                        |
| **Cierre de caja**    | Cobro mostrador y arqueo del día                                     |
| **Ingresos y egresos**| Movimientos que no son cuotas                                        |
| **Categorías**        | Cuánto sale la cuota de cada categoría                               |
| **Usuarios**          | Quién entra al panel y con qué permisos *(sólo admin)*               |
| **Configuración**     | Intereses, vencimientos y datos bancarios del portal                 |

---

## El circuito de cobro

Hay dos caminos, y la diferencia importa.

### 1. Cobro en el mostrador

La secretaría busca a la familia, marca las cuotas y registra el pago. Queda
**confirmado en el acto**: las cuotas se saldan, se emite recibo y el importe
entra al cierre de caja del día.

```
Secretaría → elige cuotas → registra pago → cuotas pagadas + recibo + caja
```

### 2. Pago informado desde el portal

El socio entra con DNI y PIN, elige sus cuotas, transfiere por su cuenta y avisa.

```
Socio → informa pago → queda "en revisión"
                            ↓
        Panel → Pagos a confirmar → Confirmar → cuotas pagadas + recibo + caja
                                  → Rechazar  → las cuotas siguen impagas
```

**El pago informado no salda la cuota.** Hasta que alguien del club verifica que
la plata llegó, la cuota sigue figurando como impaga (marcada "en revisión" para
que nadie la cobre dos veces). Es la única forma de que el portal no sea un
botón para ponerse al día sin pagar.

Mientras un pago está en revisión:

- El socio ve "en revisión" y no puede volver a informarla.
- En Cuotas y en el diálogo de cobro aparece un aviso, para que la secretaría no
  la cobre por mostrador sin darse cuenta.
- Si igual se cobró por mostrador, al confirmar el pago del portal el sistema
  avisa del conflicto en vez de duplicar el cobro.

---

## Reglas de negocio

### Cuánto sale una cuota

El monto sale **siempre** de la tabla `categories`, que es la única fuente de
verdad. Una categoría define:

- `baseAmount` — el monto mensual.
- `paysQuota` — si está apagado, no se le generan cuotas (ej: el plantel superior).
- `siblingDiscountPercent` — descuento por hermanos propio de esa categoría.

```
total = monto base − descuento por hermanos + interés por mora
```

### Descuento por hermanos

Se aplica sólo si la familia tiene **2 o más socios activos**. Si la categoría no
define un porcentaje propio, se usa el general de Configuración.

### Mora

Una cuota pasa a **vencida** cuando pasó el vencimiento más los días de gracia.
A partir de ahí acumula interés simple, todos los días:

```
interés = (monto base − descuento) × tasa diaria × días de atraso
```

El interés se calcula sobre el **monto neto**, no sobre el de lista: una familia
con descuento por hermanos paga interés sobre lo que realmente debe.

Esto lo mantiene al día la función `syncOverdueQuotas` (`api/domain/quotas.ts`),
que corre sola al principio de cada consulta que lo necesita. No hace falta ni
un cron ni apretar ningún botón.

### Numeración de recibos

`R-<año>-<número>`, con un contador por año en la tabla `receipt_sequences` que
se incrementa dentro de la misma transacción que crea el pago. No se repite ni
con dos personas cobrando al mismo tiempo.

El número se emite **al confirmar** el pago, no al informarlo: así los pagos que
terminan rechazados no gastan numeración.

### Cierre de caja

Los totales del cierre se **recalculan desde los pagos y movimientos reales** del
día cada vez que algo cambia. No son contadores que se van sumando.

```
efectivo esperado = apertura
                  + cobros en efectivo
                  + otros ingresos en efectivo
                  − egresos en efectivo
```

Las transferencias y MercadoPago se registran aparte: esa plata no está en el
cajón, así que no entra en el arqueo.

### Fechas

Todo el sistema trabaja con la fecha del club (`America/Argentina/Buenos_Aires`,
configurable en `api/lib/dates.ts`), no con la del servidor en UTC. Un cobro de
las 22:00 cae en el cierre del día correcto.

---

## Seguridad

### Quién puede hacer qué

| Nivel                 | Quién                          | Alcance                                        |
| --------------------- | ------------------------------ | ---------------------------------------------- |
| `publicProcedure`     | Cualquiera                     | Ping, login, datos bancarios del portal        |
| `portalProcedure`     | Socio o tutor con PIN          | Sólo **su propia** cuenta                      |
| `staffProcedure`      | Secretaría o admin             | El día a día del club                          |
| `adminProcedure`      | Admin                          | Usuarios, categorías, configuración, cierres   |

Cada endpoint declara su nivel explícitamente en `api/middleware.ts`. Los tests
de `api/router.test.ts` verifican que ninguno quede abierto por accidente.

### Contraseñas y PIN

Se guardan hasheados con **scrypt** (viene en Node, sin dependencias extra). El
formato es autodescriptivo, así que los valores viejos en texto plano se detectan
y se migran solos la primera vez que la persona ingresa bien.

Hay **límite de intentos**: 8 por minuto en el login del panel, 5 en el PIN del
portal, con bloqueo temporal. Un PIN de 4 dígitos son 10.000 combinaciones.

### La API REST de Supabase, desactivada

Supabase publica todas las tablas por una API REST propia, accesible con una
clave que por diseño es pública. Este sistema no la usa —se conecta directo a
Postgres— así que la migración `0001_habilita_rls.sql` activa Row Level Security
en todas las tablas y le quita los permisos a los roles de esa API.

Sin eso, cualquiera con la URL del proyecto podía leer el padrón completo. **Si
agregás una tabla nueva, habilitale RLS.**

### Sesiones

Dos cookies distintas, ambas `httpOnly` y `sameSite: lax`:

- `kimi_sid` — panel administrativo, 7 días.
- `club_portal_sid` — portal de socios, 30 días.

**El navegador nunca manda un id de socio.** La identidad sale de la cookie
firmada y el backend la deriva de ahí. Todos los ids de cuota que llegan en un
cobro se validan contra el pagador antes de tocar nada.

### Activación del PIN del portal

La primera vez, la familia tiene que ingresar el DNI **y la fecha de nacimiento
del socio**. Es un dato que conocen y que no figura en ninguna pantalla pública.
Cambiar un PIN ya activo exige el PIN actual; si se olvidaron, la secretaría lo
blanquea desde la ficha del socio o del tutor.

---

## La base de datos

PostgreSQL con [Drizzle ORM](https://orm.drizzle.team/), alojado en Supabase.

Los tests corren contra [PGlite](https://pglite.dev) —Postgres de verdad, en
memoria— usando **los mismos archivos de migración** que producción. Así el SQL
que se prueba es el que después corre en la nube, sin necesidad de Docker.

### Convenciones

- **Los importes son pesos enteros**, sin centavos. Evita errores de redondeo.
- **Las fechas de calendario** (vencimiento, pago, cierre) son `date`. Drizzle
  las entrega como texto `YYYY-MM-DD`.
- **Las marcas de tiempo técnicas** (`createdAt`, `sentAt`) son timestamps.
- **Los secretos** (`password`, `pin`) guardan un hash, nunca el texto plano.

### Tablas

| Tabla                | Qué guarda                                                |
| -------------------- | --------------------------------------------------------- |
| `local_users`        | Usuarios del panel                                        |
| `guardians`          | Tutores / responsables                                    |
| `players`            | Socios deportivos                                         |
| `categories`         | Categorías y montos de cuota                              |
| `quotas`             | Una fila por socio y por mes                              |
| `payments`           | Cobros, con su estado de confirmación                     |
| `payment_quotas`     | Qué cuotas cubre cada pago                                |
| `receipt_sequences`  | Contador de recibos por año                               |
| `transactions`       | Ingresos y egresos que no son cuotas                      |
| `daily_closures`     | Cierre de caja diario                                     |
| `alert_logs`         | Avisos de deuda preparados o enviados                     |
| `settings`           | Configuración del club, en pares clave/valor              |
| `login_attempts`     | Intentos fallidos de login y PIN (límite de intentos)     |

### Copias de seguridad

Supabase hace backups automáticos diarios. Igual conviene bajarse uno propio de
vez en cuando desde **Database → Backups**, o con `pg_dump` contra `DIRECT_URL`.

---

## Tareas comunes

### Generar las cuotas del mes

Cuotas y pagos → **Generar mes**. Sólo crea las que faltan, así que se puede
apretar dos veces sin duplicar nada. Si algún socio está en una categoría que no
está cargada, avisa cuáles son en vez de inventar un monto.

### Dar de alta un socio

Socios → **Nuevo socio**. Si la familia ya está en el sistema, elegí el tutor y
las cuotas quedan agrupadas para que paguen todo junto. Un socio mayor que se
maneja solo va "sin tutor" y entra al portal con su propio DNI.

### Cobrar

Desde Cuotas, Familias, Deudores o Cierre de Caja: en todas está el mismo
diálogo. El importe lo calcula el servidor sumando las cuotas elegidas.

### Cambiar el monto de una categoría

Categorías → editar. **Afecta sólo a las cuotas que se generen de ahí en
adelante**: las ya emitidas conservan el monto con el que salieron, que es lo que
corresponde contablemente.

### Agregar un endpoint

1. La regla de negocio va en `api/domain/`, con su test.
2. El endpoint va en el router de su área, eligiendo el nivel de acceso.
3. El frontend lo usa con `trpc.<router>.<endpoint>` — los tipos salen solos.

---

## Pendiente

### Cobro online de verdad

Hoy MercadoPago es sólo una etiqueta: el socio elige "pagué por MercadoPago" e
informa el pago, y alguien lo confirma a mano. Para automatizarlo hay que:

1. Crear la aplicación en MercadoPago y guardar el access token en `.env`.
2. Al informar el pago, crear una preferencia y redirigir al checkout.
3. Recibir el webhook de MercadoPago en `api/boot.ts` y, cuando el pago llegue
   aprobado, llamar a `confirmPayment` con el id del pago.

La pieza que falta es sólo el paso 2 y 3: `confirmPayment` ya hace todo lo demás
(salda cuotas, emite recibo, actualiza caja) y el campo `mercadopagoPaymentId`
ya está en la tabla esperando.

### Otras ideas

- **Recibo en PDF** para mandar por WhatsApp después de cobrar.
- **Aviso automático** unos días antes del vencimiento.
- **Convenios de pago** en cuotas para deudas grandes.
- **Foto del comprobante** en el portal (el campo `attachmentUrl` ya existe).
- **Backup automático** diario a una carpeta o a la nube.
