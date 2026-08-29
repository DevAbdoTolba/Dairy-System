import { notFound } from "next/navigation";
import { getInventorySummary } from "@/modules/inventory";
import { transactionTypes } from "@/modules/transactions/domain/transaction";
import { TransactionForm } from "@/modules/transactions/ui/transaction-form";

export default async function TransactionPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!transactionTypes.includes(type as (typeof transactionTypes)[number])) notFound();
  const inventory = await getInventorySummary();
  return (
    <TransactionForm
      type={type as (typeof transactionTypes)[number]}
      variants={inventory}
      stockByVariant={Object.fromEntries(inventory.map((item) => [item.id, item.stock]))}
    />
  );
}
