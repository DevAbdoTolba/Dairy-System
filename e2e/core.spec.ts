import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("رمز المالك").fill("123456");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/dashboard/);
}
test("owner can record production, sale and return while protecting stock", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
  await page.getByRole("button", { name: "إضافة تصنيع" }).click();
  await expect(page.getByRole("heading", { name: "إضافة تصنيع" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("production-workspace.png"), fullPage: true });
  await page.getByRole("button", { name: "5 كجم", exact: true }).first().click();
  await page.getByRole("spinbutton", { name: "الكمية", exact: true }).fill("3");
  await page.getByRole("button", { name: "حفظ الحركة" }).click();
  await expect(page.getByText("تم حفظ الحركة")).toBeVisible();
  await page.goto("/transactions/SALE");
  await page.getByRole("spinbutton", { name: "الكمية", exact: true }).fill("100000");
  await page.getByRole("button", { name: "حفظ الحركة" }).click();
  await expect(page.getByText("لا يمكن أن يصبح الرصيد سالباً")).toBeVisible();
  await page.goto("/transactions/RETURN");
  await page.getByRole("spinbutton", { name: "الكمية", exact: true }).fill("1");
  await page.getByRole("button", { name: "حفظ الحركة" }).click();
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "المخزون الحالي" })).toBeVisible();
});
test("core login page is RTL and has no serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});
