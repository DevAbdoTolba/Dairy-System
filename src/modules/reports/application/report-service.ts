import { getInventorySummary, listTransactions } from "@/modules/inventory";
import { calculateMetrics } from "../domain/metrics";

export async function getReport(from: string, to: string) {
  const transactions = await listTransactions({ from, to, includeVoided: false, limit: 1000 });
  const inventory = await getInventorySummary(from, to);
  const byWeight = inventory.map((variant) => {
    const scoped = transactions.filter(
      (transaction) => transaction.productVariantId === variant.id,
    );
    return {
      ...variant,
      metrics: calculateMetrics(scoped),
    };
  });
  return { transactions, metrics: calculateMetrics(transactions), byWeight };
}

function csvCell(value: string | number | null) {
  const raw = value === null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function reportCsv(from: string, to: string) {
  const { transactions } = await getReport(from, to);
  const rows = [
    ["التاريخ", "النوع", "الفئة", "الكمية", "الحالة", "ملاحظة"],
    ...transactions.map((transaction) => [
      transaction.businessDate,
      transaction.type,
      `${transaction.weightKg} كجم`,
      transaction.quantity,
      transaction.status,
      transaction.note,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\n")}`;
}
