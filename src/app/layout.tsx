import type { Metadata, Viewport } from "next";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acompanhamento Nutricional — TACO + EWMA + Supabase",
  description: "Painel privado de acompanhamento nutricional com base TACO, projeção EWMA e histórico sincronizado.",
  applicationName: "Painel Nutricional",
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Nutrição",
    statusBarStyle: "black",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-[var(--background)] text-[var(--foreground)] antialiased min-h-screen">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
