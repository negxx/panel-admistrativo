# Auditoría de seguridad

Este documento registra las vulnerabilidades encontradas en el sistema, cómo se
corrigieron y cómo se verificó que la corrección funciona.

> **Nota sobre el historial de git.** La auditoría y las correcciones se hicieron
> antes del primer `push`, así que quedaron dentro del commit `fe7ee9a`, cuyo
> mensaje habla sólo de la migración a PostgreSQL. Se documentan acá en lugar de
> reescribir el historial para simular una cronología distinta. La única
> excepción es el hallazgo #11, posterior, que sí tiene su commit propio
> (`ea097ae`).
>
> Las correcciones se hicieron en colaboración con Claude (Anthropic); los
> commits lo indican con `Co-Authored-By`.

---

## Resumen

| # | Hallazgo | Gravedad | Estado |
| --- | --- | --- | --- |
| 1 | Toda la API sin autenticación | Crítica | Corregido |
| 2 | Cualquiera podía apropiarse de una cuenta del portal | Crítica | Corregido |
| 3 | La identidad del socio la ponía el navegador | Crítica | Corregido |
| 4 | Contraseñas y PIN en texto plano | Crítica | Corregido |
| 5 | Cobros sin validar a quién pertenecen las cuotas | Crítica | Corregido |
| 6 | El portal daba cuotas por pagadas sin cobrar nada | Crítica | Corregido |
| 7 | Sin límite de intentos de ingreso | Alta | Corregido |
| 8 | Sesiones de un año | Alta | Corregido |
| 9 | Cookies expuestas a CSRF | Alta | Corregido |
| 10 | El sistema se podía quedar sin administradores | Media | Corregido |
| 11 | La API REST de Supabase exponía todos los datos | Crítica | Corregido |

Los datos en juego son especialmente sensibles: **el padrón incluye menores de
edad**, con nombre, DNI, fecha de nacimiento, domicilio y teléfono de la familia.

---

## 1. Toda la API estaba sin autenticación

**El problema.** Ocho de los once routers (`player`, `guardian`, `quota`,
`payment`, `transaction`, `alert`, `portal`, `dashboard`) usaban el procedimiento
público de tRPC. Sin ninguna sesión, cualquiera que alcanzara el servidor podía
listar el padrón completo, crear y borrar socios, cambiar montos de cuotas,
marcar cuotas como pagadas y registrar cobros.

**La corrección.** Se definieron cuatro niveles de acceso explícitos en
[`server/middleware.ts`](server/middleware.ts):

| Nivel | Quién | Alcance |
| --- | --- | --- |
| `publicProcedure` | Cualquiera | Ping, login, datos bancarios del portal |
| `portalProcedure` | Socio con PIN | Sólo **su propia** cuenta |
| `staffProcedure` | Secretaría o admin | El día a día del club |
| `adminProcedure` | Admin | Usuarios, categorías, configuración |

Cada endpoint declara el suyo. No hay procedimiento "por defecto".

**Verificación.** [`server/router.test.ts`](server/router.test.ts) levanta la
aplicación real y comprueba por HTTP que 23 endpoints devuelven 401 sin sesión.
Si alguien vuelve a dejar uno abierto, el test falla.

---

## 2. Cualquiera podía apropiarse de una cuenta del portal

**El problema.** El endpoint `setPin` fijaba el PIN de cualquier DNI sin
verificar absolutamente nada. Como el padrón era público (hallazgo #1), obtener
un DNI era trivial: con eso se le ponía un PIN nuevo a esa familia y se entraba a
su cuenta.

**La corrección.** La activación del PIN ahora exige una prueba de identidad: la
**fecha de nacimiento del socio**, un dato que la familia conoce y que no aparece
en ninguna pantalla pública. Cambiar un PIN ya activo requiere el PIN actual. La
secretaría puede blanquearlo desde el panel para quien lo olvide.

Ver `portal.activate` y `portal.changePin` en
[`server/routers/portal-router.ts`](server/routers/portal-router.ts).

---

## 3. La identidad del socio la ponía el navegador

**El problema.** El portal guardaba `localStorage.portalGuardianId` y cada
endpoint recibía ese id como parámetro, confiando en él. Cambiar ese número desde
la consola del navegador mostraba la deuda de otra familia y permitía pagar en su
nombre. Es un caso de libro de *Insecure Direct Object Reference*.

**La corrección.** La identidad viaja en una cookie firmada (JWT) `httpOnly`, que
el navegador no puede leer ni modificar. El frontend **ya no envía ningún id de
socio**: el backend lo deriva de la cookie.

Ver [`server/lib/portal-session.ts`](server/lib/portal-session.ts) y el contexto
en [`server/context.ts`](server/context.ts).

---

## 4. Contraseñas y PIN en texto plano

**El problema.** Las contraseñas del panel se guardaban sin hashear y se
comparaban con `!==`. Los PIN de las familias, igual. Quien accediera a la base
—o a un backup— obtenía todas las credenciales en claro.

**La corrección.** Hasheo con **scrypt** (incluido en Node, sin dependencias
externas) en [`server/lib/crypto.ts`](server/lib/crypto.ts). El formato guardado
es autodescriptivo (`scrypt$N$salt$hash`), lo que permitió detectar los valores
heredados en texto plano y migrarlos automáticamente la primera vez que cada
persona ingresó correctamente: nadie quedó afuera durante la transición.

La comparación es de tiempo constante, para no filtrar información por la
duración de la respuesta.

---

## 5. Cobros sin validar a quién pertenecen las cuotas

**El problema.** Los endpoints de cobro recibían una lista de ids de cuota y los
cobraban sin comprobar que fueran del pagador. Se podía saldar la cuota de otra
familia enviando ids sueltos.

Además, el importe se calculaba con una consulta mal construida
(`IN (${ids.join(",")})`, que Drizzle enviaba como **un solo parámetro** con el
texto `"1,2,3"`): al pagar más de una cuota no coincidía ninguna fila, el pago se
registraba en **$0** y las cuotas quedaban marcadas como pagadas igual. Había dos
pagos así en la base real, por $108.000 y $138.000.

**La corrección.** `loadPayableQuotas()` en
[`server/domain/payments.ts`](server/domain/payments.ts) valida que **todas** las
cuotas pertenezcan al pagador antes de tocar nada, y que ninguna esté ya pagada.
El importe lo calcula el servidor; nunca llega del navegador. Todo el cobro corre
dentro de una transacción.

**Verificación.** [`server/domain/payments.test.ts`](server/domain/payments.test.ts)
comprueba contra un PostgreSQL real que cobrar cuotas ajenas se rechaza, que el
importe de varias cuotas se suma bien y que una cuota no se puede cobrar dos
veces.

---

## 6. El portal daba cuotas por pagadas sin cobrar nada

**El problema.** Cuando un socio apretaba "Pagar" en el portal, el sistema marcaba
la cuota como pagada en el acto. No había integración de pagos: bastaba con
apretar el botón para quedar al día sin que entrara un peso al club.

**La corrección.** Los pagos informados desde el portal nacen en estado
`pending_review` y **no saldan la cuota**. Aparecen en la pantalla *Pagos a
confirmar*, donde alguien del club verifica la transferencia. Recién al confirmar
se saldan las cuotas, se emite el recibo y el importe entra al cierre de caja.

Mientras tanto la cuota figura "en revisión", para que no se cobre dos veces; si
igual se cobró por mostrador, al confirmar el sistema avisa del conflicto en lugar
de duplicar.

---

## 7. Sin límite de intentos de ingreso

**El problema.** Ni el login del panel ni la verificación de PIN limitaban los
intentos. Un PIN de cuatro dígitos son 10.000 combinaciones: se prueban todas en
segundos.

**La corrección.** Limitador con ventana y bloqueo temporal en
[`server/lib/rate-limit.ts`](server/lib/rate-limit.ts): 8 intentos por minuto en
el panel, 5 en el portal. Los contadores se guardan en la base, no en memoria,
porque en un entorno serverless cada petición puede atenderla una instancia
distinta y un contador en memoria no limita nada.

Los mensajes de error no distinguen entre usuario inexistente y contraseña
incorrecta, para no confirmar qué usuarios existen.

---

## 8, 9. Sesiones de un año y cookies expuestas a CSRF

Las sesiones duraban un año: una cookie robada servía indefinidamente y no había
forma de invalidarla. Se redujeron a 7 días para el panel y 30 para el portal.

Las cookies se emitían con `sameSite: "None"` fuera de localhost, lo que permite
que cualquier sitio dispare peticiones autenticadas contra la API. Se cambió a
`Lax`, que alcanza porque el panel y la API comparten dominio.

Ver [`server/lib/cookies.ts`](server/lib/cookies.ts) y
[`contracts/constants.ts`](contracts/constants.ts).

---

## 10. El sistema se podía quedar sin administradores

Un admin podía borrarse a sí mismo o borrar al último administrador, dejando el
sistema sin nadie que pudiera administrarlo. Ahora ambas operaciones se rechazan
([`server/routers/users-router.ts`](server/routers/users-router.ts)).

---

## 11. La API REST de Supabase exponía todos los datos

**El problema.** Supabase publica automáticamente todas las tablas por una API
REST propia, accesible con la clave *publishable*, que por diseño es pública y
viaja en el JavaScript del navegador. El sistema no usa esa API —se conecta
directo a PostgreSQL— pero la puerta quedaba abierta igual.

Comprobado desde fuera, sin autenticación:

```
GET /rest/v1/players    → 200  nombres y DNIs de menores
GET /rest/v1/guardians  → 200  nombres, DNIs y teléfonos
GET /rest/v1/payments   → 200  historial completo
POST /rest/v1/players   → 200  también permitía escribir
```

**La corrección.** La migración
[`db/migrations/0001_habilita_rls.sql`](db/migrations/0001_habilita_rls.sql)
habilita *Row Level Security* en las 14 tablas. Sin políticas definidas, el
resultado es denegar todo para los roles de esa API. Como segunda barrera se les
revocan los permisos, incluidos los de tablas que se creen en el futuro.

Además se desactivó la Data API por completo desde el panel de Supabase: si el
proyecto no la usa, apagarla elimina la superficie de ataque en vez de sólo
custodiarla.

La aplicación no se ve afectada: se conecta con el rol `postgres`, dueño de las
tablas, que omite RLS.

**Verificación.** Las mismas peticiones de arriba devuelven 401 (con RLS) y 503
(con la API desactivada), mientras el panel y el portal siguen funcionando.

---

## Cómo se verifica todo esto

```bash
npm test
```

**94 tests**, de los cuales los relevantes para seguridad son:

- `server/router.test.ts` — que ningún endpoint quede sin protección.
- `server/domain/payments.test.ts` — validación de pertenencia de las cuotas,
  importes correctos, imposibilidad de cobrar dos veces.
- `server/lib/crypto.test.ts` — hasheo, verificación y migración de los valores
  heredados en texto plano.

Los tests de integración corren contra un PostgreSQL real en memoria
([PGlite](https://pglite.dev)) usando **los mismos archivos de migración** que
producción, para que el SQL que se prueba sea el que después se ejecuta.

---

## Lo que queda pendiente

- **Cobro online real.** MercadoPago es hoy sólo una etiqueta: el socio informa el
  pago y alguien lo confirma a mano. Falta crear la preferencia de pago y recibir
  el webhook. La pieza que confirma (`confirmPayment`) ya está hecha.
- **Registro de auditoría.** Se guarda quién confirma o rechaza cada pago, pero no
  hay un historial general de quién modificó qué.
- **Segundo factor** para las cuentas de administrador.
