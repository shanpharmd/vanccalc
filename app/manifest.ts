import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VancoCalc Pro — Vancomycin AUC Dosing Calculator",
    short_name: "VancoCalc Pro",
    description:
      "Clinical vancomycin dosing calculator using population pharmacokinetics. AUC24-guided dosing per ASHP/IDSA 2020 consensus.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0891b2",
    icons: [
      {
        src: "/favicon.jpg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
