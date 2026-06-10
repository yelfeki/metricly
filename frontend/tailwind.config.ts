import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Tailwind class aliases — kept for backwards compatibility but remapped
        // to the editorial-modern fonts so legacy `font-playfair` / `font-jakarta`
        // class usage across the app now renders Instrument Serif / DM Sans.
        playfair: ["var(--font-instrument-serif)", "Iowan Old Style", "Georgia", "serif"],
        jakarta: ["var(--font-dm-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Canonical names — prefer these in new code
        "instrument-serif": ["var(--font-instrument-serif)", "Iowan Old Style", "Georgia", "serif"],
        "dm-sans": ["var(--font-dm-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
