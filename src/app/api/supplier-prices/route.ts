import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { listPricePeriods, setMilkPrice } from "@/modules/suppliers/application/account-service";
import { hasOwnerSession, validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function GET() {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  return NextResponse.json(
    { prices: await listPricePeriods() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const result = await setMilkPrice(await request.json());
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر حفظ سعر اللبن.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
