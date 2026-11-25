import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acompanhamento Nutricional — TACO + EWMA + Supabase",
  description: "Painel privado de acompanhamento nutricional com base TACO, projeção EWMA e histórico sincronizado.",
  robots: {
    index: false,
    follow: false,
  },
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
      </body>
    </html>
  );
}
