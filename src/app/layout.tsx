import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/shared/design-system/providers";

export const metadata: Metadata = {
  title: "نظام معمل الجبنة",
  description: "إدارة تصنيع وبيع ومرتجع صفائح الجبنة",
  applicationName: "نظام معمل الجبنة",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "معمل الجبنة",
  },
};

export const viewport: Viewport = { themeColor: "#075985", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
