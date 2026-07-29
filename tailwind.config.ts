import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Prussian navy — identity, chrome, interactive states.
        brand: {
          50: "#f2f6fa",
          100: "#e0eaf4",
          200: "#c1d5e8",
          300: "#96b5d3",
          400: "#648eb8",
          500: "#3e6c9c",
          600: "#2b5480",
          700: "#1f4066",
          800: "#16324f",
          900: "#0e2033",
          950: "#071420",
        },
        // Copper — actionable values and emphasis. Deliberately non-semantic so it
        // never competes with the clinical green / amber / red states.
        accent: {
          50: "#fdf5f0",
          100: "#fae8dc",
          200: "#f4cfb8",
          300: "#eaae8a",
          400: "#dc8b5c",
          500: "#c0713f",
          600: "#a55c31",
          700: "#874929",
          800: "#6b3a23",
          900: "#55301e",
        },
        // Graphite — neutral, a touch warm, so surfaces read premium rather than default.
        ink: {
          50: "#f8f8f7",
          100: "#f0f0ee",
          200: "#e3e2df",
          300: "#cac9c4",
          400: "#9d9c96",
          500: "#6c6b65",
          600: "#585752",
          700: "#42413d",
          800: "#2c2b28",
          900: "#1b1a18",
          950: "#111110",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "sans-serif"],
        serif: ["ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,50,79,0.05), 0 4px 12px rgba(22,50,79,0.07)",
        glow: "0 0 0 1px rgba(192,113,63,0.18), 0 8px 24px rgba(192,113,63,0.20)",
      },
    },
  },
  plugins: [],
};

export default config;
