import { getInventorySummary, listTransactions } from "@/modules/inventory";
import { todayInCairo } from "@/shared/dates/business-date";
import { calculateMetrics } from "@/modules/reports/domain/metrics";

export async function getDashboard() {
  const today = todayInCairo();
  const todaysTransactions = await listTransactions({
    from: today,
    to: today,
    includeVoided: false,
  });
  const yesterdayDate = new Date(`${today}T12:00:00Z`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  const yesterdayTransactions = await listTransactions({
    from: yesterday,
    to: yesterday,
    includeVoided: false,
  });
  const inventory = await getInventorySummary();
  const [lastTransaction] = await listTransactions({ includeVoided: false, limit: 1 });
  return {
    today,
    inventory,
    todaysTransactions,
    todayMetrics: calculateMetrics(todaysTransactions),
    noEntriesToday: todaysTransactions.length === 0,
    noEntriesYesterday: yesterdayTransactions.length === 0,
    lastTransaction: lastTransaction ?? null,
  };
}
