import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VancoCalc Pro — Vancomycin AUC Dosing Calculator",
  description:
    "Clinical vancomycin dosing calculator using population pharmacokinetics. AUC24-guided dosing per ASHP/IDSA 2020 consensus.",
  icons: {
    icon: "/favicon.jpg",
    apple: "/favicon.jpg",
  },
  metadataBase: new URL("https://www.vanccalc.com"),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "vancomycin calculator",
    "AUC dosing",
    "vancomycin AUC",
    "pharmacokinetics calculator",
    "ASHP IDSA 2020 vancomycin",
    "AUC24 guided dosing",
    "clinical pharmacy",
  ],
  authors: [{ name: "TheraIntel" }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "VancoCalc Pro — Vancomycin AUC Dosing Calculator",
    description:
      "Clinical vancomycin dosing calculator using population pharmacokinetics. AUC24-guided dosing per ASHP/IDSA 2020 consensus.",
    url: "https://www.vanccalc.com",
    siteName: "VancoCalc Pro",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VancoCalc Pro — Vancomycin AUC Dosing Calculator",
    description:
      "Clinical vancomycin dosing calculator using population pharmacokinetics. AUC24-guided dosing per ASHP/IDSA 2020 consensus.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "VancoCalc Pro",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  url: "https://www.vanccalc.com",
  description:
    "Clinical vancomycin dosing calculator using population pharmacokinetics. AUC24-guided dosing per ASHP/IDSA 2020 consensus.",
  audience: {
    "@type": "MedicalAudience",
    audienceType: "Clinician",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Organization",
    name: "TheraIntel",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
