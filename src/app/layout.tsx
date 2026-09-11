import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { MemberProvider } from "@/hooks/useMember";

export const metadata: Metadata = {
  title: "90 Days Growing Together",
  description: "ME → WE → US: 90 Days of Growing Together",
  manifest: "/manifest.json",
  appleWebApp: {
    // iOS ignores manifest.json for "Add to Home Screen" — these
    // meta tags are what actually make it feel like an installed app.
    capable: true,
    statusBarStyle: "default",
    title: "Grow Together",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#43A047",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="antialiased text-gray-800">
        <MemberProvider>{children}</MemberProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
