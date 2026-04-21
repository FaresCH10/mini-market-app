import Navbar from "@/components/AdminNav";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import { Suspense } from "react";
import ChatWidgetLoader from "@/components/ChatWidgetLoader";
import { Inter } from "next/font/google";
// import { WalletProvider } from "@/context/WalletContext";
import { CartProvider } from "@/context/CartContext";
import ApprovalGuard from "@/components/ApprovalGuard";
import type { Viewport } from "next";

export const metadata = {
  title: "NavyBits Market",
  description: "NavyBits Market - Mini Market",
  metadataBase: new URL("https://yourdomain.com"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        {/* <WalletProvider> */}
          <CartProvider>
            <ApprovalGuard />
            <Suspense fallback={<div className="bg-gray-800 h-16" />}>
              <Navbar />
            </Suspense>
            <main>{children}</main>
            <Toaster position="bottom-right" />
            <ChatWidgetLoader />
          </CartProvider>
        {/* </WalletProvider> */}
      </body>
    </html>
  );
}
