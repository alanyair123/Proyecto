import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("mueve al jugador a la derecha y hacia abajo con el teclado", async ({ page }) => {
  await login(page);
  await page.goto("/play?mode=solo");

  const canvas = page.locator("canvas[aria-label='Mapa del juego']");
  const playerPosition = page.getByTestId("player-pos");
  await expect(canvas).toBeVisible();
  await expect(playerPosition).toBeAttached();

  const initialX = Number(await playerPosition.getAttribute("data-x"));
  const initialY = Number(await playerPosition.getAttribute("data-y"));
  await canvas.click();
  await page.keyboard.press("d");
  await expect.poll(async () => Number(await playerPosition.getAttribute("data-x"))).toBe(initialX + 1);

  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => Number(await playerPosition.getAttribute("data-y"))).toBe(initialY + 1);
});
