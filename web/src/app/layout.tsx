import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/navigation/Navbar";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
};

/** Brand colours from content/site.json, exposed as the theme's CSS variables. */
const themeVars = {
  "--color-brand": site.colors.brand,
  "--color-accent": site.colors.accent,
  "--color-footer": site.colors.footer,
} as React.CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={site.lang} style={themeVars}>
      <body className="bg-white font-sans text-gray-900 antialiased">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
