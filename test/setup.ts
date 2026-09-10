import { applyD1Migrations, env } from "cloudflare:test";

// Cada archivo de pruebas corre contra una D1 efímera: se aplican las migraciones
// una vez antes de la suite.
await applyD1Migrations(env.DB, env.MIGRACIONES);
