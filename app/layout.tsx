import type { Metadata, Viewport } from "next"
import { Inter, Newsreader } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["400", "500", "600"] })
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  weight: ["400", "500"],
})

const DESCRIPTION =
  "Ein gesturstyrt musikkloss. Vri klossen, styr musikken. micro:bit V2 i ein 3D-printa kobolt-kropp."

export const metadata: Metadata = {
  metadataBase: new URL("https://musikkloss.iverfinne.no"),
  title: "musikkloss — micro:bit V2",
  description: DESCRIPTION,
  applicationName: "musikkloss",
  openGraph: {
    type: "website",
    siteName: "musikkloss",
    title: "musikkloss — micro:bit V2",
    description: DESCRIPTION,
    url: "https://musikkloss.iverfinne.no",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#f3f0e9",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nn" className={`${inter.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  )
}
