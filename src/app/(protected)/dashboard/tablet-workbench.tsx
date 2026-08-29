"use client";

import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import KeyboardReturnOutlinedIcon from "@mui/icons-material/KeyboardReturnOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import type { ProductVariant } from "@/modules/inventory";
import type { TransactionType } from "@/modules/transactions/domain/transaction";
import { TransactionForm } from "@/modules/transactions/ui/transaction-form";
import { formatArabicDate } from "@/shared/dates/business-date";
import {
  pendingMetric,
  pendingStockChange,
  type QueuedTransaction,
} from "@/shared/offline/offline-queue";
import { listenForQueueChanges, listQueuedTransactions } from "@/shared/offline/offline-store";
import { UndoLastEntry } from "./undo-last-entry";

type QuickAction = "OVERVIEW" | "PRODUCTION" | "SALE" | "RETURN";

type DashboardData = {
  today: string;
  inventory: Array<
    ProductVariant & {
      stock: number;
      kilograms: number;
      produced: number;
      sold: number;
      returned: number;
    }
  >;
  todayMetrics: { production: number; sales: number; returns: number };
  noEntriesToday: boolean;
  noEntriesYesterday: boolean;
  lastTransaction: { id: string; quantity: number } | null;
};

const quickActions: Array<{
  id: QuickAction;
  label: string;
  description: string;
  color: "primary" | "success" | "error" | "secondary";
  Icon: typeof SpaceDashboardOutlinedIcon;
}> = [
  {
    id: "OVERVIEW",
    label: "نظرة عامة",
    description: "الرصيد وملخص اليوم",
    color: "primary",
    Icon: SpaceDashboardOutlinedIcon,
  },
  {
    id: "PRODUCTION",
    label: "إضافة تصنيع",
    description: "زيادة رصيد المخزون",
    color: "success",
    Icon: AddCircleOutlineIcon,
  },
  {
    id: "SALE",
    label: "إضافة بيع",
    description: "تسجيل الكمية المباعة",
    color: "error",
    Icon: PointOfSaleOutlinedIcon,
  },
  {
    id: "RETURN",
    label: "إضافة مرتجع",
    description: "إضافة المرتجع للمخزون",
    color: "secondary",
    Icon: KeyboardReturnOutlinedIcon,
  },
];

export function TabletWorkbench({
  dashboard,
  variants,
}: {
  dashboard: DashboardData;
  variants: ProductVariant[];
}) {
  const [selectedAction, setSelectedAction] = useState<QuickAction>("OVERVIEW");
  const [productionVariantId, setProductionVariantId] = useState(variants[0]?.id ?? "");
  const [offlineEntries, setOfflineEntries] = useState<QueuedTransaction[]>([]);
  const activeAction = quickActions.find((action) => action.id === selectedAction)!;
  useEffect(() => {
    const refresh = () =>
      void listQueuedTransactions()
        .then(setOfflineEntries)
        .catch(() => undefined);
    refresh();
    return listenForQueueChanges(refresh);
  }, []);

  const projectedDashboard = useMemo(
    () => ({
      ...dashboard,
      inventory: dashboard.inventory.map((item) => {
        const stock = item.stock + pendingStockChange(offlineEntries, item.id);
        return { ...item, stock, kilograms: stock * item.weightKg };
      }),
      todayMetrics: {
        production:
          dashboard.todayMetrics.production +
          pendingMetric(offlineEntries, "PRODUCTION", dashboard.today),
        sales:
          dashboard.todayMetrics.sales + pendingMetric(offlineEntries, "SALE", dashboard.today),
        returns:
          dashboard.todayMetrics.returns + pendingMetric(offlineEntries, "RETURN", dashboard.today),
      },
      noEntriesToday:
        dashboard.noEntriesToday &&
        !offlineEntries.some(
          (entry) => entry.state === "pending" && entry.payload.businessDate === dashboard.today,
        ),
    }),
    [dashboard, offlineEntries],
  );
  const stockByVariant = Object.fromEntries(
    projectedDashboard.inventory.map((item) => [item.id, item.stock]),
  );

  function startProductionForVariant(productVariantId: string) {
    setProductionVariantId(productVariantId);
    setSelectedAction("PRODUCTION");
  }

  return (
    <Stack spacing={{ xs: 2, md: 2.5 }}>
      <Box>
        <Typography component="h1" variant="h1">
          لوحة اليوم: {formatArabicDate(dashboard.today)}
        </Typography>
        <Typography color="text.secondary">
          اختر العملية من اللوحة، ثم أكملها دون مغادرة الشاشة.
        </Typography>
      </Box>

      <Grid container spacing={2.5} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper
            component="aside"
            aria-label="اختيار عملية سريعة"
            sx={{
              p: 1.5,
              height: { md: "100%" },
              position: { md: "sticky" },
              top: { md: 16 },
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Stack spacing={1.25}>
              <Box sx={{ px: 0.5, pb: 0.5 }}>
                <Typography component="h2" variant="h2">
                  التشغيل السريع
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  اختر ما تريد تسجيله الآن
                </Typography>
              </Box>
              <Grid container spacing={1}>
                {quickActions.map(({ id, label, description, color, Icon }) => {
                  const isActive = id === selectedAction;
                  return (
                    <Grid key={id} size={{ xs: 6, sm: 3, md: 12 }}>
                      <Button
                        type="button"
                        variant={isActive ? "contained" : "outlined"}
                        color={isActive ? color : "primary"}
                        onClick={() => setSelectedAction(id)}
                        aria-pressed={isActive}
                        fullWidth
                        startIcon={<Icon />}
                        sx={{
                          minHeight: { xs: 76, md: 68 },
                          px: 1.5,
                          justifyContent: "flex-start",
                          textAlign: "right",
                          alignItems: "flex-start",
                        }}
                      >
                        <Box>
                          <Box component="span" sx={{ display: "block", fontWeight: 800 }}>
                            {label}
                          </Box>
                          <Box
                            component="span"
                            aria-hidden="true"
                            sx={{
                              display: { xs: "none", md: "block" },
                              fontSize: "0.8rem",
                              fontWeight: 500,
                              lineHeight: 1.35,
                              opacity: isActive ? 0.9 : 0.75,
                            }}
                          >
                            {description}
                          </Box>
                        </Box>
                      </Button>
                    </Grid>
                  );
                })}
              </Grid>

              {dashboard.lastTransaction && (
                <Box
                  sx={{
                    mt: 0.5,
                    p: 1.25,
                    bgcolor: "background.default",
                    borderRadius: 1.5,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    آخر حركة: {dashboard.lastTransaction.quantity} صفيحة
                  </Typography>
                  <UndoLastEntry id={dashboard.lastTransaction.id} />
                </Box>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper
            component="section"
            aria-label={activeAction.label}
            sx={{
              p: { xs: 2, sm: 2.5, md: 3 },
              minHeight: { md: 560 },
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            {selectedAction === "OVERVIEW" ? (
              <DashboardOverview
                dashboard={projectedDashboard}
                onStartProduction={startProductionForVariant}
              />
            ) : (
              <TransactionForm
                embedded
                type={selectedAction as TransactionType}
                variants={variants}
                stockByVariant={stockByVariant}
                initialVariantId={selectedAction === "PRODUCTION" ? productionVariantId : undefined}
              />
            )}
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function DashboardOverview({
  dashboard,
  onStartProduction,
}: {
  dashboard: DashboardData;
  onStartProduction: (productVariantId: string) => void;
}) {
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography component="h2" variant="h2">
          الرصيد الحالي
        </Typography>
        <Typography color="text.secondary">
          هذه الأرقام هي الرصيد الفعلي بعد آخر حركة محفوظة.
        </Typography>
      </Box>
      {dashboard.noEntriesToday && <Alert severity="warning">لم يتم تسجيل حركة اليوم.</Alert>}
      {dashboard.noEntriesYesterday && (
        <Alert severity="info">تنبيه: لم تُسجل حركة أمس. راجع يوم الإغلاق عند الحاجة.</Alert>
      )}
      <Grid container spacing={1.5}>
        {dashboard.inventory.map((item) => (
          <Grid key={item.id} size={{ xs: 6, sm: 4, md: 6 }}>
            <Card sx={{ height: "100%" }}>
              <CardActionArea
                onClick={() => onStartProduction(item.id)}
                aria-label={`إضافة تصنيع لوزن ${item.weightKg} كجم`}
                sx={{ height: "100%", textAlign: "right" }}
              >
                <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
                  <Typography color="text.secondary" variant="body2">
                    {item.nameAr}
                  </Typography>
                  <Typography variant="h2" sx={{ mt: 0.5 }}>
                    {item.stock} صفيحة
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    {item.kilograms} كجم
                  </Typography>
                  {item.stock <= 0 && (
                    <Typography
                      color={item.stock < 0 ? "error.main" : "warning.main"}
                      variant="body2"
                      sx={{ mt: 0.75, fontWeight: 800 }}
                    >
                      {item.stock < 0 ? "رصيد سالب" : "الرصيد صفر"}
                    </Typography>
                  )}
                  <Typography color="primary.main" variant="body2" sx={{ mt: 1, fontWeight: 800 }}>
                    اضغط لإضافة تصنيع
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Box
        sx={{
          p: 2,
          borderRadius: 1.5,
          bgcolor: "background.default",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.75, sm: 3 }}>
          <Typography>تصنيع: {dashboard.todayMetrics.production}</Typography>
          <Typography>بيع: {dashboard.todayMetrics.sales}</Typography>
          <Typography>مرتجع: {dashboard.todayMetrics.returns}</Typography>
        </Stack>
      </Box>
      <Button href="/inventory" variant="outlined" startIcon={<Inventory2OutlinedIcon />}>
        عرض تفاصيل المخزون
      </Button>
    </Stack>
  );
}
