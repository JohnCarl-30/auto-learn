import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "auto-learn",
  description: "Fix your sentence, and learn the word that fixed it.",
  // With the manifest, this is what makes "Add to Home Screen" on iOS open it
  // as an app (no browser bars) under the name "auto-learn".
  appleWebApp: { capable: true, title: "auto-learn", statusBarStyle: "default" },
};

// `cover` draws under the notch and home indicator; the composer pads itself
// with the safe-area inset so nothing it holds is hidden there.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the class on <html> before paint, which the server
    // cannot predict; suppressing the warning on this one element is the
    // documented cost of not flashing the wrong theme on load.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/*
            The workspace is a client component holding the draft and the open
            card, so the header's one line about who is signed in has to read
            the session on the client too. This provider is what lets it, and
            it fetches once for the whole tree rather than per component.
          */}
          <SessionProvider>{children}</SessionProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
