import { expect, type Page } from "@playwright/test";

export async function login(page: Page): Promise<void> {
  await page.goto("/login?callbackUrl=%2Fstats");
  await page.getByLabel("Usuario").fill("tester");
  await page.getByLabel("Contraseña").fill("correcta-123");
  await page.getByRole("button", { name: "Entrar con usuario de prueba" }).click();
  await expect(page).toHaveURL(/\/stats(?:\?|$)/);
}
