import type { Metadata } from "next";
import { Archivo, Geist_Mono, Newsreader } from "next/font/google";

import { APP_NAME } from "@/lib/app-brand";
import { getCurrentUserOrNull } from "@/lib/auth";

import "./globals.css";

const sans = Archivo({
  axes: ["wdth"],
  subsets: ["latin"],
  variable: "--font-archivo",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const voice = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  description: "Minimal invoicing for independent work.",
  title: APP_NAME,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCurrentUserOrNull();
  return (
    <html data-theme={context?.user.theme ?? "light"} lang="en">
      <body className={`${sans.variable} ${mono.variable} ${voice.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
