// Catálogo de errores tipados de dinero (diseño frontend §7.4). Traduce códigos
// VK_* / VINKO_* a clave i18n + acción y marca si el dinero se movió.
import { test, assert, loadTs } from "./_harness.mjs";

const { codeFrom, toVkError } = await loadTs("lib/errors.ts");

await test("codeFrom: reconoce VK_* directos", () => {
  assert.equal(codeFrom("VK_INSUFFICIENT_FUNDS"), "VK_INSUFFICIENT_FUNDS");
  assert.equal(codeFrom("algo VK_PORRA_CLOSED al final"), "VK_PORRA_CLOSED");
});

await test("codeFrom: mapea los VINKO_* existentes (M0 y P2P)", () => {
  assert.equal(codeFrom("VINKO_MONEY_UNDERAGE"), "VK_UNDERAGE");
  assert.equal(codeFrom("VINKO_P2P_CLOSED"), "VK_PORRA_CLOSED");
  assert.equal(codeFrom("VINKO_MONEY_LIMIT"), "VK_LIMIT_DAILY");
  assert.equal(codeFrom("VINKO_MONEY_COUNTRY_OFF"), "VK_REGION_UNAVAILABLE");
  assert.equal(codeFrom("VINKO_MONEY_ALREADY_IN"), "VK_ALREADY_ENTERED");
});

await test("codeFrom: red y desconocido", () => {
  assert.equal(codeFrom("TypeError: Failed to fetch"), "NETWORK");
  assert.equal(codeFrom("algo raro de postgres"), "UNKNOWN");
  assert.equal(codeFrom(null), "UNKNOWN");
});

await test("toVkError: clave i18n, acción y bandera 'moved'", () => {
  const insuf = toVkError({ message: "VK_INSUFFICIENT_FUNDS" });
  assert.equal(insuf.messageKey, "money.err.VK_INSUFFICIENT_FUNDS");
  assert.equal(insuf.actionKey, "money.act.VK_INSUFFICIENT_FUNDS");
  assert.equal(insuf.moved, "no");

  const underage = toVkError({ message: "VINKO_MONEY_UNDERAGE" });
  assert.equal(underage.code, "VK_UNDERAGE");
  assert.equal(underage.actionKey, null); // underage no ofrece acción
  assert.equal(underage.moved, "no");

  const net = toVkError(new Error("network timeout"));
  assert.equal(net.code, "NETWORK");
  assert.equal(net.moved, "unknown"); // red: el dinero puede haberse movido o no

  const unknown = toVkError("boom");
  assert.equal(unknown.code, "UNKNOWN");
  assert.equal(unknown.moved, "unknown");
  assert.equal(unknown.actionKey, "money.act.UNKNOWN");
});
