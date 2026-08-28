import { z } from "zod";
import { isIsoDate } from "@/shared/dates/business-date";
import { addVariant, setVariantActive, updateSettings } from "@/modules/inventory";

const settingsSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  startDate: z.string().refine(isIsoDate, "التاريخ غير صحيح"),
});

export function saveSettings(input: unknown) {
  updateSettings(settingsSchema.parse(input));
}

const variantSchema = z.object({
  nameAr: z.string().trim().min(2).max(50),
  weightKg: z.number().int().positive().max(1000),
  visualToken: z.string().trim().min(2).max(50).default("weight-custom"),
});

export function createVariant(input: unknown) {
  return addVariant(variantSchema.parse(input));
}

export function archiveVariant(id: string) {
  if (!setVariantActive(id, false)) throw new Error("فئة الوزن غير موجودة.");
}
