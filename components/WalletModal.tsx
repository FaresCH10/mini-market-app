"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { useWallet } from "@/context/WalletContext";

type WalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onBalanceUpdate: (newBalance: number) => void;
};

const QUICK_AMOUNTS = [50, 100, 500, 1000];

export default function WalletModal({ isOpen, onClose, onBalanceUpdate }: WalletModalProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentAmount, setCurrentAmount] = useState(0);
  const { refreshBalance } = useWallet();
  const supabase = createClient();

  const getCurrentAmount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("wallet_balance")
        .eq("id", user.id)
        .single();
      setCurrentAmount(profile?.wallet_balance || 0);
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      getCurrentAmount();
      setAmount("");
    }
  }, [isOpen]);

  if (!isOpen) return null;
  const isInDebt = currentAmount < 0;

  const addMoney = async () => {
    const addAmount = parseFloat(amount);
    if (!addAmount || addAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data: profile } = await supabase
        .from("profiles")
        .select("wallet_balance")
        .eq("id", user.id)
        .single();

      const currentBalance = profile?.wallet_balance || 0;
      const newBalance = currentBalance + addAmount;

      // Auto-pay pending debt orders (oldest first) when user recharges.
      let remainingTopUp = addAmount;
      const { data: debtOrders, error: debtFetchError } = await supabase
        .from("orders")
        .select("id, total_price, paid_amount")
        .eq("user_id", user.id)
        .eq("type", "dept")
        .neq("payment_status", "paid")
        .order("created_at", { ascending: true });

      if (debtFetchError) throw debtFetchError;

      for (const order of debtOrders ?? []) {
        if (remainingTopUp <= 0) break;
        const paid = order.paid_amount || 0;
        const remainingDebt = Math.max(0, order.total_price - paid);
        if (remainingDebt <= 0) continue;

        const payment = Math.min(remainingTopUp, remainingDebt);
        const updatedPaid = paid + payment;
        const isPaid = updatedPaid >= order.total_price;

        const { error: debtUpdateError } = await supabase
          .from("orders")
          .update({
            paid_amount: updatedPaid,
            payment_status: isPaid ? "paid" : "partial",
            status: isPaid ? "completed" : "pending",
          })
          .eq("id", order.id);

        if (debtUpdateError) throw debtUpdateError;
        remainingTopUp -= payment;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ wallet_balance: newBalance })
        .eq("id", user.id);

      if (error) throw error;

      setCurrentAmount(newBalance);
      await refreshBalance();
      onBalanceUpdate(newBalance);
      toast.success(`${addAmount}K L.L added to wallet!`);
      onClose();
    } catch (error) {
      console.error("Error adding money:", error);
      toast.error("Failed to add money");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className={`px-6 pt-6 pb-8 text-white ${isInDebt ? "bg-gradient-to-br from-red-700 to-red-500" : "bg-gradient-to-br from-[#000080] to-[#1F51FF]"}`}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs font-medium text-blue-200 uppercase tracking-wider mb-1">My Wallet</p>
              <h2 className="text-2xl font-bold">{currentAmount.toLocaleString()}K L.L</h2>
              <p className="text-blue-200 text-sm mt-0.5">Current Balance</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 -mt-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Add Funds</p>

            {/* Quick amounts */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className={`py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                    amount === String(q)
                      ? "bg-[#000080] text-white border-[#000080]"
                      : "bg-gray-50 text-gray-600 border-gray-100 hover:border-[#000080] hover:text-[#000080]"
                  }`}
                >
                  {q}K
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="relative">
              <input
                type="number"
                step="1"
                min="1"
                placeholder="Custom amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addMoney(); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] transition-all pr-16"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">
                K L.L
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addMoney}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#000080] text-white hover:bg-[#1F51FF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Adding..." : `Add ${amount ? `${amount}K` : ""} L.L`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
