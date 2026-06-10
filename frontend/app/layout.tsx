import type { Metadata } from "next"
import {
  DM_Sans,
  Instrument_Serif,
  JetBrains_Mono,
  Playfair_Display,
  Plus_Jakarta_Sans,
} from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/components/AuthProvider"

// Existing fonts — kept for pages still on the previous aesthetic.
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
})

// New design-system fonts (Metricly editorial-modern) — exposed as
// --font-instrument-serif / --font-dm-sans / --font-jetbrains-mono. The
// mx-* token layer in globals.css aliases these into --mx-font-display etc.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
})

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: "Metricly — Psychometric Intelligence",
  description:
    "Scientifically rigorous psychometric tools for the Arab world — reliability, factor analysis, and bias detection.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${jakarta.variable} ${instrumentSerif.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        {/* Filigree bell-curve decoration removed per user request — the page
            background relies solely on the atelier washes (warm top-right +
            cool bottom-left + faint wine centre) set on <html> in globals.css. */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
