// E2E do fluxo de senha temporária (cadastro pelo administrador).
//
// Fluxo correto:
//   1. admin cria o usuário com e-mail de login → recebe senha temporária;
//   2. jogador entra em /login (NÃO em /ativar) com e-mail + senha;
//   3. o sistema o leva direto a /profile para ele definir a própria senha;
//   4. depois disso, entra normalmente em /app.
//
// O teste cria um usuário temporário, percorre o fluxo inteiro e apaga o
// usuário no final (auth.admin.deleteUser).
import { chromium } from "playwright";
import { buildAdminClient, loadEnv } from "./_demo-shared.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const errors = [];
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
  if (!cond) errors.push(label);
};

loadEnv();
const adminApi = buildAdminClient();

const stamp = Date.now().toString(36);
const name = `Teste Fluxo ${stamp}`;
const email = `teste-fluxo-${stamp}@fch.example.com`;
const emailCorrigido = `teste-fluxo-${stamp}-corrigido@fch.example.com`;
const finalPassword = "NovaSenha@123";

/** Login com retry (o Auth do Supabase limita tentativas seguidas). */
async function login(page, mail, password, expectedUrl) {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", mail);
    await page.fill("#password", password);
    if ((await page.inputValue("#email")) !== mail) {
      await page.fill("#email", mail);
      await page.fill("#password", password);
    }
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL(expectedUrl, { timeout: 15000 });
      return true;
    } catch {
      await page.waitForTimeout(2500);
    }
  }
  return false;
}

const browser = await chromium.launch();
let userId = null;

try {
  // ---------- administrador cria o usuário ----------
  const ctxAdmin = await browser.newContext({ locale: "pt-BR" });
  const adminPage = await ctxAdmin.newPage();
  ok("admin logou", await login(adminPage, "demo-admin@example.com", "Demo@12345", "**/app**"));

  await adminPage.goto(`${BASE}/admin/players/new`, { waitUntil: "networkidle" });
  await adminPage.fill("#name", name);
  await adminPage.fill("#email", email);
  const levelValue = await adminPage.locator("#level_id option").nth(1).getAttribute("value");
  await adminPage.selectOption("#level_id", levelValue);
  await adminPage.click('button[type="submit"]:has-text("Criar usuário")');

  const alerta = adminPage.locator(".alert-warn").first();
  await alerta.waitFor({ timeout: 20000 });
  const textoAlerta = await alerta.innerText();
  const codes = await alerta.locator("code").allTextContents();
  const tempPassword = codes[0];
  ok("senha temporária exibida", !!tempPassword && tempPassword.length >= 8, tempPassword ? "••••" : "");
  ok("e-mail de login exibido junto", codes[1] === email, codes[1]);
  ok(
    "alerta explica que o acesso é por /login",
    textoAlerta.includes("/login") && /Não use/i.test(textoAlerta),
  );
  ok(
    "alerta tem botão de copiar os dados",
    (await alerta.locator('button:has-text("Copiar dados de acesso")').count()) === 1,
  );

  userId = (
    await adminApi.from("profiles").select("id").eq("email", email).maybeSingle()
  ).data?.id ?? null;
  ok("perfil criado no banco", !!userId);
  const perfilCriado = await adminApi
    .from("profiles")
    .select("must_change_password, pending_approval")
    .eq("id", userId)
    .maybeSingle();
  ok(
    "perfil exige troca de senha e já está aprovado",
    perfilCriado.data?.must_change_password === true &&
      perfilCriado.data?.pending_approval === false,
  );

  // ---------- jogador entra com a senha temporária ----------
  const ctxPlayer = await browser.newContext({ locale: "pt-BR" });
  const playerPage = await ctxPlayer.newPage();
  ok(
    "login com senha temporária funciona",
    await login(playerPage, email, tempPassword, "**/profile**"),
    playerPage.url(),
  );
  const textoPerfil = await playerPage.locator("body").innerText();
  ok("aviso de senha temporária", /senha temporária/i.test(textoPerfil));
  ok("e-mail correto no perfil", textoPerfil.includes(email));

  await playerPage.fill("#new-password", finalPassword);
  await playerPage.fill("#confirm-password", finalPassword);
  await playerPage.click('button[type="submit"]:has-text("Definir minha senha")');
  let voltouAoApp = false;
  try {
    await playerPage.waitForURL("**/app**", { timeout: 20000 });
    voltouAoApp = true;
  } catch {
    voltouAoApp = false;
  }
  ok("depois de definir a senha vai para /app", voltouAoApp, playerPage.url());

  const perfilDepois = await adminApi
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  ok("flag de troca de senha foi limpa", perfilDepois.data?.must_change_password === false);

  // ---------- novo login com a senha definitiva ----------
  const ctxFinal = await browser.newContext({ locale: "pt-BR" });
  const finalPage = await ctxFinal.newPage();
  ok(
    "login com a senha definitiva entra direto no painel",
    await login(finalPage, email, finalPassword, "**/app**"),
    finalPage.url(),
  );
  ok(
    "não pede troca de senha de novo",
    !finalPage.url().includes("/profile") &&
      !/Defina a sua própria senha/i.test(await finalPage.locator("body").innerText()),
  );

  // ---------- administrador corrige o e-mail de login ----------
  await adminPage.goto(`${BASE}/admin/players/${userId}`, { waitUntil: "networkidle" });
  ok("tela de edição mostra o e-mail do login", (await adminPage.locator(".page-sub").innerText()).includes(email));
  await adminPage.fill("#email", emailCorrigido);
  await adminPage.click('button[type="submit"]:has-text("Salvar alterações")');
  await adminPage.locator(".alert-ok").first().waitFor({ timeout: 20000 });
  await adminPage.reload({ waitUntil: "networkidle" });
  ok(
    "e-mail de login corrigido no cadastro",
    (await adminPage.locator(".page-sub").innerText()).includes(emailCorrigido),
  );

  const ctxEmail = await browser.newContext({ locale: "pt-BR" });
  const emailPage = await ctxEmail.newPage();
  ok(
    "login funciona com o e-mail corrigido (senha atual mantida)",
    await login(emailPage, emailCorrigido, finalPassword, "**/app**"),
    emailPage.url(),
  );

  // ---------- redefinição pelo administrador mostra e-mail + senha ----------
  await adminPage.click('button:has-text("Gerar nova senha temporária")');
  const alertaReset = adminPage.locator(".alert-warn").first();
  await alertaReset.waitFor({ timeout: 20000 });
  const codesReset = await alertaReset.locator("code").allTextContents();
  const novaTemp = codesReset[0];
  ok("redefinição mostra a nova senha", !!novaTemp && novaTemp !== tempPassword);
  ok("redefinição mostra o e-mail de login", codesReset[1] === emailCorrigido);

  const ctxReset = await browser.newContext({ locale: "pt-BR" });
  const resetPage = await ctxReset.newPage();
  ok(
    "senha redefinida funciona e volta a exigir troca",
    await login(resetPage, emailCorrigido, novaTemp, "**/profile**"),
    resetPage.url(),
  );

  // ---------- /ativar é só para código de convite ----------
  const ctxAtivar = await browser.newContext({ locale: "pt-BR" });
  const ativarPage = await ctxAtivar.newPage();
  await ativarPage.goto(`${BASE}/ativar`, { waitUntil: "networkidle" });
  const textoAtivar = await ativarPage.locator("body").innerText();
  ok(
    "página de ativação avisa que senha temporária é no /login",
    /senha temporária/i.test(textoAtivar) && /\/login|login/i.test(textoAtivar),
  );
  await ativarPage.fill("#code", novaTemp);
  await ativarPage.click('button[type="submit"]:has-text("Continuar")');
  await ativarPage.waitForTimeout(2500);
  const erroAtivar = await ativarPage.locator(".alert-error").innerText().catch(() => "");
  ok(
    "senha temporária não é aceita como código de ativação",
    /código/i.test(erroAtivar) && !ativarPage.url().includes("/app"),
    erroAtivar.slice(0, 60),
  );
} finally {
  if (userId) {
    const { error } = await adminApi.auth.admin.deleteUser(userId);
    if (error) console.log("AVISO: falha ao remover usuário de teste:", error.message);
  }
  await browser.close();
}

console.log(errors.length ? `\n${errors.length} FALHA(S)` : "\nFLUXO DE SENHA TEMPORÁRIA OK");
process.exit(errors.length ? 1 : 0);
