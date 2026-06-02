import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ритм — тихий режим для дня",
  description:
    "трекер фокусу без зайвого шуму. блоки часу, вечірній огляд, м'який тренер.",
  applicationName: "ритм",
  appleWebApp: {
    capable: true,
    title: "ритм",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1014",
  width: "device-width",
  initialScale: 1,
  // No maximumScale — never block pinch-zoom. Accessibility > "fixed
  // app feel". A user with vision needs must be able to enlarge text.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        {children}
        <ServiceWorkerRegister />
        <Toaster richColors theme="dark" position="top-center" />
      </body>
    </html>
  );
}
