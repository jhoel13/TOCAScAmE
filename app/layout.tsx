import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TOCAScAmE – Análisis Matricial de Armaduras",
  description:
    "Aplicación académica para el análisis matricial de armaduras planas 2D.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
