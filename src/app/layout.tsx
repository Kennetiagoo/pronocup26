import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Prono Cup 2026",
  description:
    "Aplicación web de pronósticos del Mundial 2026 con login, tabla de posiciones y panel admin.",
  icons: {
    icon: [
      { url: "/favicon.ico?v=mundial-2026", sizes: "any" },
      { url: "/icon.svg?v=mundial-2026", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}

