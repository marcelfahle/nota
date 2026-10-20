import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
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
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nota",
  },
  description: "Minimal invoicing for independent work.",
  manifest: "/manifest.webmanifest",
  title: APP_NAME,
};

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [context, locale] = await Promise.all([getCurrentUserOrNull(), getLocale()]);
  const theme = context?.user.theme ?? "light";
  return (
    <html data-theme={theme} lang={locale}>
      <head>
        {theme === "system" ? (
          <>
            <meta content="#fbf9f4" media="(prefers-color-scheme: light)" name="theme-color" />
            <meta content="#181512" media="(prefers-color-scheme: dark)" name="theme-color" />
          </>
        ) : (
          <meta content={theme === "dark" ? "#181512" : "#fbf9f4"} name="theme-color" />
        )}
      </head>
      <body className={`${sans.variable} ${mono.variable} ${voice.variable} antialiased`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
