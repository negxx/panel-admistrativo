/**
 * Arranque en producción.
 *
 *     npm start
 *
 * El script anterior era `NODE_ENV=production node dist/boot.js`, sintaxis que
 * no funciona en cmd ni en PowerShell. Esto hace lo mismo desde Node, así que
 * corre igual en Windows, Linux y macOS sin dependencias extra.
 */
process.env.NODE_ENV ??= "production";

await import("../dist/serve.js");
