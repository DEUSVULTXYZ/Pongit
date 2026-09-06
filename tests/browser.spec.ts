import { test, expect } from "@playwright/test";
test("Two browser players, live spectator, session inputs, reconnect, replay and mobile layout", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const errors: string[] = [];
  for (const p of pages) p.on("pageerror", (e) => errors.push(e.message));
  try {
    await Promise.all(pages.map((p) => p.goto("http://localhost:3000")));
    for (const p of pages.slice(0, 2)) {
      await expect(p.locator(".network")).toContainText("LOCAL CHAIN");
      await p.getByRole("button", { name: /^Connect passkey/ }).click();
      await p
        .getByRole("button", { name: "Local test player", exact: true })
        .click();
      await expect(
        p.getByRole("button", { name: "Find an opponent" }),
      ).toBeEnabled();
    }
    await Promise.all(
      pages
        .slice(0, 2)
        .map((p) =>
          p.getByRole("button", { name: "Find an opponent" }).click(),
        ),
    );
    for (const p of pages.slice(0, 2))
      await expect(p.locator(".match-bar")).toContainText("IN PLAY", {
        timeout: 45000,
      });
    await pages[2].getByRole("button", { name: /^Live/ }).click();
    await expect(pages[2].locator(".match-row").first()).toBeVisible();
    await pages[2].locator(".match-row").first().click();
    await expect(pages[2].locator(".match-bar")).toContainText("SPECTATOR");
    await pages[0].keyboard.down("s");
    await pages[0].waitForTimeout(800);
    await pages[0].keyboard.up("s");
    await pages[0].waitForTimeout(1000);
    await expect(pages[0].locator("canvas")).toBeVisible();
    await pages[0].screenshot({
      path: "artifacts/browser-arena.png",
      fullPage: true,
    });
    // Spectator reconnect must resume from contract state without a signing key.
    await pages[2].reload();
    await pages[2].getByRole("button", { name: /^Live/ }).click();
    await pages[2].locator(".match-row").first().click();
    await expect(pages[2].locator("canvas")).toBeVisible();
    await pages[0]
      .getByRole("button", { name: "Concede", exact: true })
      .click();
    await expect(pages[0].locator(".match-bar")).toContainText("FINAL", {
      timeout: 20000,
    });
    await pages[2].getByRole("button", { name: "Ladder", exact: true }).click();
    await expect(pages[2].locator("tbody tr").first()).toBeVisible({
      timeout: 20000,
    });
    await pages[2]
      .getByRole("button", { name: "Archive", exact: true })
      .click();
    await pages[2].locator(".match-row").first().click();
    await expect(
      pages[2].getByRole("button", { name: "Play replay" }),
    ).toBeVisible({ timeout: 20000 });
    await pages[2].getByRole("button", { name: "Play replay" }).click();
    await expect(
      pages[2].getByRole("button", { name: "Pause replay" }),
    ).toBeVisible();
    await pages[2].setViewportSize({ width: 390, height: 844 });
    await pages[2].screenshot({
      path: "artifacts/browser-mobile.png",
      fullPage: true,
    });
    const overflow = await pages[2].evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
