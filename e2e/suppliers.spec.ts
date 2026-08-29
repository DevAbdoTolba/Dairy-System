import { expect, test } from "@playwright/test";

async function loginOwner(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("رمز المالك").fill("123456");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/pos/);
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
  await page.getByRole("button", { name: "فتح الوردية" }).click();
  await page.getByRole("button", { name: "فاطمة حسن", exact: true }).click();
  await page.getByRole("button", { name: "+", exact: true }).first().click();
  await page.getByRole("button", { name: "حفظ لبن بقري" }).click();
  await expect(page.getByText("فاطمة حسن").last()).toBeVisible();
  await page.getByRole("button", { name: "إغلاق الوردية" }).click();
  await page.getByLabel("رمز الاستلام").fill("123456");
  await page.getByRole("button", { name: "تأكيد الإغلاق" }).click();
  await expect(page.getByText("وردية مغلقة")).toBeVisible();
  await expect(page.getByRole("link", { name: "الإعدادات" })).toHaveCount(0);
});
