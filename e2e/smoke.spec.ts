import { expect, test } from "@playwright/test";

test.describe("InvoraLite smoke", () => {
  test("loads splash then setup or login shell", async ({ page }) => {
    await page.goto("/");

    // Splash / loading completes into either Setup or Login (browser = licensed).
    await expect(page.getByText(/Invora|InvoraLite|Business Setup|Sign in|Login/i).first()).toBeVisible({
      timeout: 45_000,
    });

    // App shell should not crash into a blank root.
    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("footer branding is present after splash", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Baraily Innovations|InvoraLite/i).first()).toBeVisible({
      timeout: 45_000,
    });
  });
});
