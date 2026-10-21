#!/usr/bin/env node
/**
 * Remove as contas de demonstração (`demo-*`) criadas por
 * `npm run demo:seed`. Dados reais (atletas, partidas, códigos,
 * classificação) permanecem intactos — a massa demo tem 0 jogos.
 */
import { buildAdminClient, cleanupDemo, loadEnv } from "./_demo-shared.mjs";

loadEnv();
const admin = buildAdminClient();

console.log("Removendo contas de demonstração...");
await cleanupDemo(admin, { log: (m) => console.log("  " + m) });
console.log("Pronto. Rode `npm run demo:seed` para recriá-las.");
