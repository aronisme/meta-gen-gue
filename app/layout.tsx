import type { Metadata } from "next";
import { Karla, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/Providers";

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MetaGen Studio - Microstock Metadata Generator",
  description: "AI-powered metadata generator for stock images & videos. Auto-failover dual proxy, high-speed vision analysis, and 1-click CSV export for Adobe Stock, Shutterstock, Vecteezy, Freepik, and Dreamstime.",
  keywords: ["stock photography", "metadata generator", "AI", "keywords", "SEO", "Adobe Stock", "Shutterstock"],
  authors: [{ name: "Meta-Gen" }],
  openGraph: {
    title: "MetaGen Studio - Microstock Metadata Generator",
    description: "Generate AI-powered titles, descriptions, and keywords for stock assets with 1-click CSV export.",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${karla.variable} ${playfair.variable} min-h-screen bg-[#fffaf0] text-[#2c1810] font-sans antialiased selection:bg-[#ff6b35] selection:text-white`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
