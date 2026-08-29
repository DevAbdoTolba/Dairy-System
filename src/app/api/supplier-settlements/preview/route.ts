import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  MissingMilkPriceError,
  previewSupplierSettlement,
} from "@/modules/suppliers/application/settlement-service";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    return NextResponse.json({ preview: await previewSupplierSettlement(await request.json()) });
  } catch (error) {
    const message =
      error instanceof ZodError || error instanceof MissingMilkPriceError || error instanceof Error
        ? error.message
        : "تعذر معاينة التسوية.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
