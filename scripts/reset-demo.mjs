#!/usr/bin/env node
/**
 * Remove TODA a massa de teste criada por `npm run demo:seed`:
 * usuários `demo-*`, partidas `demo-*` e os snapshots publicados.
 * Dados reais (seu admin, seus jogadores) permanecem intactos.
 */
import { buildAdminClient, cleanupDemo, loadEnv } from "./_demo-shared.mjs";

loadEnv();
const admin = buildAdminClient();

console.log("Removendo massa de teste...");
await cleanupDemo(admin, { log: (m) => console.log("  " + m) });
console.log("Pronto. Rankings públicos voltaram ao estado vazio.");
