import type { Metadata } from "next"
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

// 3 papéis tipográficos (mesmo sistema do spa-sapienza):
// display = títulos, sans = corpo/UI, mono = assinatura (números, rótulos).
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], display: "swap", variable: "--font-display" })
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-sans" })
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Sapienza — Console",
  description: "Console operacional único da plataforma Sapienza SaaS.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
