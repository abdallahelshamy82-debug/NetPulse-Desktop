import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NetPulse — Network Telemetry, SSL/TLS & DNS Diagnostic Suite",
  description:
    "Live SSL/TLS certificate & security headers auditor, DNS radar, paced TCP port scanner, and native Windows hardware telemetry.",
  icons: {
    icon: "/icon.svg",
  },
};

const initThemeScript = `
(function() {
  try {
    var theme = localStorage.getItem('netpulse_theme_v1');
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    var lang = localStorage.getItem('netpulse_lang_v1');
    document.documentElement.dir = 'ltr';
    if (lang === 'ar') {
      document.documentElement.lang = 'ar';
    } else {
      document.documentElement.lang = 'en';
    }
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${ibmPlexArabic.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: initThemeScript }} />
      </head>
      <body className="font-sans antialiased overflow-hidden bg-canvas text-ink selection:bg-cyan-500/25 selection:text-cyan-400">
        {children}
      </body>
    </html>
  );
}
