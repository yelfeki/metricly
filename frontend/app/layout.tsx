import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

export const metadata: Metadata = {
  title: "Metricly — Psychometric Intelligence",
  description:
    "Scientifically rigorous psychometric tools for the Arab world — reliability, factor analysis, and bias detection.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // RTL readiness: swap lang="en" → lang="ar" and add dir="rtl" for Arabic.
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
