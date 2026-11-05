import type { Metadata, Viewport } from "next"
import { Bitter, Source_Sans_3 } from "next/font/google"
import "./globals.css"
import { ToastProvider } from "@/components/ui/toast"

const bitter = Bitter({
  subsets: ["latin"],
  variable: "--font-bitter",
  weight: ["500", "600", "700", "800"],
})

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "RestaurantOS",
  description: "Gestiona tu restaurante fácilmente",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#121b1e",
  colorScheme: "dark",
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${bitter.variable} ${sourceSans.variable}`}>
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
