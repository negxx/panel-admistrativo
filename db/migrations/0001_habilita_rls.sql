-- Cierra la API REST automática de Supabase.
--
-- Supabase publica todas las tablas del esquema `public` por una API REST propia
-- (PostgREST), accesible con la clave *publishable*, que por diseño es pública y
-- viaja en el navegador. Sin Row Level Security, esa API deja leer y escribir
-- todo: el padrón completo con nombres y DNIs de menores, teléfonos de las
-- familias y el historial de pagos.
--
-- Este sistema **no usa esa API**: se conecta directo a Postgres con Drizzle. La
-- puerta quedaba abierta sin que nadie la usara.
--
-- Al habilitar RLS sin definir ninguna política, el resultado es "denegar todo"
-- para los roles `anon` y `authenticated`, que son los que usa la API REST.
--
-- La aplicación no se ve afectada: se conecta con el rol `postgres`, que es
-- dueño de las tablas y por lo tanto **omite RLS** (mientras no se active
-- FORCE ROW LEVEL SECURITY, que no se activa acá).

ALTER TABLE "users"              ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "local_users"        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guardians"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "players"            ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotas"             ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_quotas"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipt_sequences"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alert_logs"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_closures"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "login_attempts"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Segunda barrera: se le quitan los permisos a los roles de la API REST.
--
-- RLS por sí solo ya alcanza, pero esto cubre el caso de que alguien cree una
-- política permisiva por error más adelante. Defensa en profundidad.
REVOKE ALL ON ALL TABLES    IN SCHEMA "public" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM anon, authenticated;--> statement-breakpoint

-- Y lo mismo para las tablas que se creen en el futuro.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES    FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM anon, authenticated;
