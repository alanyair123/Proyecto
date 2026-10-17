import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("crea una sala y cambia el estado listo según confirma el servidor", async ({ page }) => {
  await login(page);
  await page.goto("/lobby");

  const lobbyName = `Sala ${Date.now()}`;
  await page.getByLabel("Nombre de la sala").fill(lobbyName);
  await page.getByLabel("Máximo de jugadores").selectOption("4");
  await page.getByRole("button", { name: "Crear sala" }).click();

  await expect(page.getByRole("heading", { name: lobbyName })).toBeVisible();
  const readyStatus = page.getByTestId("my-ready-status");
  const readyToggle = page.getByTestId("ready-toggle");
  await expect(readyStatus).toHaveText("No listo");

  await readyToggle.click();
  await expect(readyStatus).toHaveText("Listo");
  await readyToggle.click();
  await expect(readyStatus).toHaveText("No listo");
});
