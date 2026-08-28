"use client";

import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  ["/dashboard", "الرئيسية", SpaceDashboardOutlinedIcon],
  ["/inventory", "المخزون", Inventory2OutlinedIcon],
  ["/history", "السجل", HistoryOutlinedIcon],
  ["/reports", "التقارير", AssessmentOutlinedIcon],
  ["/settings", "الإعدادات", SettingsOutlinedIcon],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar sx={{ minHeight: 64, gap: 2 }}>
          <Typography variant="h2" component="p" sx={{ flexGrow: 1, color: "inherit" }}>
            نظام معمل الجبنة
          </Typography>
          <Button
            onClick={logout}
            color="inherit"
            variant="outlined"
            sx={{ borderColor: "rgba(255,255,255,.7)" }}
          >
            خروج
          </Button>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, pb: 5 }}>
        <Stack
          component="nav"
          direction="row"
          spacing={1}
          useFlexGap
          aria-label="التنقل الرئيسي"
          sx={{ mb: 3, flexWrap: "wrap" }}
        >
          {links.map(([href, label, Icon]) => (
            <Button
              key={href}
              component={Link}
              href={href}
              variant={pathname === href ? "contained" : "outlined"}
              startIcon={<Icon />}
              sx={{ minWidth: 116 }}
            >
              {label}
            </Button>
          ))}
        </Stack>
        {children}
      </Container>
    </Box>
  );
}
