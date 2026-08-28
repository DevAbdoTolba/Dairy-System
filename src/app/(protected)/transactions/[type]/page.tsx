import { notFound } from "next/navigation";
import { listActiveVariants } from "@/modules/inventory";
import { transactionTypes } from "@/modules/transactions/domain/transaction";
import { TransactionForm } from "@/modules/transactions/ui/transaction-form";

export default async function TransactionPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!transactionTypes.includes(type as (typeof transactionTypes)[number])) notFound();
  return (
    <TransactionForm
      type={type as (typeof transactionTypes)[number]}
      variants={await listActiveVariants()}
    />
  );
}
