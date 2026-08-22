import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://tocas-matriz.jtocasc24-1.chatgpt.site"),
  title: "TOCAS Matriz — Análisis de Armaduras 2D",
  description:
    "Aplicación profesional para el análisis matricial de armaduras planas mediante el método de rigidez.",
  openGraph: {
    title: "TOCAS Matriz",
    description: "Análisis matricial de armaduras 2D con procedimiento completo.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TOCAS Matriz — Análisis matricial de armaduras 2D" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TOCAS Matriz",
    description: "Análisis matricial de armaduras 2D con procedimiento completo.",
    images: ["/og.png"],
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
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
