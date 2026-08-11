/**
 * Hasheo de secretos (contraseñas de usuarios del panel y PIN de socios).
 *
 * Usa `scrypt`, que viene incluido en Node — no hace falta instalar bcrypt ni
 * argon2. El formato guardado es autodescriptivo:
 *
 *     scrypt$<N>$<salt en hex>$<hash en hex>
 *
 * Gracias a eso podemos detectar los valores viejos guardados en texto plano
 * (no arrancan con `scrypt$`) y migrarlos solos la primera vez que la persona
 * ingresa correctamente. Ver `verifySecret` y `needsRehash`.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/**
 * `promisify` no conserva la sobrecarga de 4 argumentos de `scrypt` (la que
 * acepta opciones), así que se envuelve a mano.
 */
function scrypt(secret: string, salt: Buffer, keylen: number, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // `maxmem` hay que subirlo a mano: scrypt necesita 128 × N × r bytes
    // (con N=32768 y r=8 son ~33 MB) y el límite por defecto de Node es 32 MB,
    // así que sin esto tira "memory limit exceeded".
    scryptCb(secret, salt, keylen, { N: cost, maxmem: MAX_MEM }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

const PREFIX = "scrypt";
/** Costo de CPU. 2^15 es un buen equilibrio para un servidor chico. */
const COST = 32768;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** Tope de memoria para scrypt, con margen sobre los ~33 MB que necesita. */
const MAX_MEM = 64 * 1024 * 1024;

/** Hashea un secreto en texto plano. Devuelve el string listo para guardar. */
export async function hashSecret(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain, salt, KEY_LENGTH, COST);
  return `${PREFIX}$${COST}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Compara un secreto en texto plano contra el valor guardado.
 *
 * Acepta tanto hashes nuevos como valores heredados en texto plano, para que
 * nadie quede afuera del sistema durante la migración. La comparación es de
 * tiempo constante en ambos casos.
 */
export async function verifySecret(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  if (!stored.startsWith(`${PREFIX}$`)) {
    // Valor heredado en texto plano.
    return safeEqual(Buffer.from(plain), Buffer.from(stored));
  }

  const [, costRaw, saltHex, hashHex] = stored.split("$");
  const cost = Number(costRaw);
  if (!cost || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(plain, salt, expected.length, cost);
  return safeEqual(derived, expected);
}

/**
 * `true` si el valor guardado quedó en texto plano o con un costo desactualizado.
 * Se usa para re-hashear en silencio después de un ingreso exitoso.
 */
export function needsRehash(stored: string | null): boolean {
  if (!stored) return false;
  if (!stored.startsWith(`${PREFIX}$`)) return true;
  return Number(stored.split("$")[1]) !== COST;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  // timingSafeEqual explota si los largos difieren, así que igualamos primero
  // comparando contra un buffer del mismo tamaño.
  if (a.length !== b.length) {
    // Igual hacemos una comparación para no filtrar el largo por tiempo.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
