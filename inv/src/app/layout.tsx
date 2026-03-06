import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";

import { APP_NAME } from "@/lib/app-brand";

import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  description: "Minimal invoicing for independent work.",
  title: APP_NAME,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
