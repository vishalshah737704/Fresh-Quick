import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { BRAND } from "@/lib/branding";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["300"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name} — food delivery, ordering, and vendor management.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
