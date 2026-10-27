import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Codebreaker",
  description: "A logic puzzle game similar to Mastermind",
  applicationName: "Codebreaker",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Codebreaker",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/app-icon.png", sizes: "500x500", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/app-icon.png", sizes: "500x500", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-50`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              const first = Math.random();
              const second = Math.random();
              if (first === second && window.crypto && window.crypto.getRandomValues) {
                Math.random = () => window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
              }
            })();`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
