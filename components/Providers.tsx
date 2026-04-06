'use client'

import { WalletProvider } from "@/context/WalletContext"
import { CartProvider } from "@/context/CartContext"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <CartProvider>
        {children}
      </CartProvider>
    </WalletProvider>
  )
}