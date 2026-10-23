import Script from "next/script";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "manualarr",
  description: "Manually add albums & singles to your Lidarr / Navidrome library.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        {children}
      <Script
          src="https://rybbit.scpx.de/api/script.js"
          data-site-id="12"
          data-skip-patterns={"[\"/api/**\", \"/auth/**\", \"/callback/**\", \"/verify/**\", \"/reset-password/**\"]"}
          data-mask-patterns={"[\"/domains/*/**\", \"/customers/*/**\", \"/tickets/*/**\", \"/servers/*/**\", \"/users/*/**\"]"}
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
