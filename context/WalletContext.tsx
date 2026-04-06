"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type WalletContextType = {
  balance: number;
  refreshBalance: () => Promise<void>;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState(0);
  const supabase = createClient();

  const refreshBalance = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("wallet_balance")
        .eq("id", user.id)
        .single();
      setBalance(profile?.wallet_balance || 0);
    } else {
      setBalance(0);
    }
  };

  // Listen for auth changes
  useEffect(() => {
    refreshBalance();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refreshBalance();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <WalletContext.Provider value={{ balance, refreshBalance }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
};