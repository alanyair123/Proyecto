import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("redirige a login al abrir estadísticas sin sesión", async ({ page }) => {
  await page.goto("/stats");
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
});

test("muestra un error visible con credenciales incorrectas", async ({ page }) => {
  await page.goto("/login?callbackUrl=%2Fstats");
  await page.getByLabel("Usuario").fill("tester");
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar con usuario de prueba" }).click();
  await expect(page.getByTestId("auth-error")).toBeVisible();
});

test("el login correcto muestra la tabla de estadísticas", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Partidas recientes" })).toBeVisible();
  await expect(page.locator("tbody tr").filter({ has: page.locator("time") }).first()).toBeVisible();
});
