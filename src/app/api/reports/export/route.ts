import { NextResponse } from "next/server";
import { hasOwnerSession } from "@/modules/auth/infrastructure/session";
import { reportCsv } from "@/modules/reports/application/report-service";
import { todayInCairo } from "@/shared/dates/business-date";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? `${todayInCairo().slice(0, 7)}-01`;
  const to = params.get("to") ?? todayInCairo();
  return new NextResponse(await reportCsv(from, to), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dairy-report-${from}-${to}.csv"`,
    },
  });
}
