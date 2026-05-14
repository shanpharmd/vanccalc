import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VancoCalc Pro — Vancomycin AUC Dosing Calculator",
  description:
    "Clinical vancomycin dosing calculator using population pharmacokinetics. AUC24-guided dosing per ASHP/IDSA 2020 consensus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
