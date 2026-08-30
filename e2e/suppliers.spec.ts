import { expect, test } from "@playwright/test";

async function loginOwner(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("رمز المالك").fill("123456");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test("POS records and closes a supplier shift without owner navigation", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "tablet",
    "Supplier workflow is exercised at the target tablet viewport.",
  );
  await loginOwner(page);
  await page.goto("/suppliers");
  await page.getByLabel("اسم المورد بالعربية").fill("فاطمة حسن");
  await page.getByRole("button", { name: "إضافة المورد" }).click();
  await expect(page.getByRole("heading", { name: "فاطمة حسن" })).toBeVisible();
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));

  await page.goto("/login");
  await page.getByRole("radio", { name: "استلام اللبن" }).check();
  await page.getByLabel("رمز استلام اللبن").fill("123456");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/pos/);
  await page.getByRole("button", { name: "صباحية" }).click();
  await page.getByRole("button", { name: "فاطمة حسن", exact: true }).click();
  await page.getByRole("button", { name: "لبن بقري" }).click();
  await page.getByRole("button", { name: "إضافة الكوب" }).click();
  await page.getByRole("button", { name: "تسجيل كمية فاطمة حسن" }).click();
  await expect(page.getByText("فاطمة حسن").last()).toBeVisible();
  await page.getByRole("button", { name: "إنهاء الوردية" }).click();
  await expect(page.getByRole("button", { name: "صباحية" })).toBeVisible();
  await expect(page.getByRole("link", { name: "الإعدادات" })).toHaveCount(0);
});
