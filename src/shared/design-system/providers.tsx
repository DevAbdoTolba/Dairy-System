"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import rtlPlugin from "stylis-plugin-rtl";
import { theme } from "./theme";
import { ServiceWorkerRegistration } from "./service-worker-registration";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "dairy-rtl", stylisPlugins: [rtlPlugin] }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ServiceWorkerRegistration />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
