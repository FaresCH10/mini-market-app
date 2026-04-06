import { CartProvider } from "@/context/CartContext";
import Navbar from "@/components/AdminNav";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import { Suspense } from "react";
import ChatWidgetLoader from "@/components/ChatWidgetLoader";
import { WalletProvider } from "@/context/WalletContext";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <CartProvider>
          <WalletProvider>
            <Suspense fallback={<div className="bg-gray-800 h-16" />}>
              <Navbar />
            </Suspense>
            <main>{children}</main>
            <Toaster position="bottom-right" />
            <ChatWidgetLoader />
          </WalletProvider>
        </CartProvider>
      </body>
    </html>
  );
}
