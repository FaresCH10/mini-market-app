"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
};

type DebtOrder = {
  id: string;
  total_price: number;
  paid_amount: number;
  payment_status: "pending" | "partial";
  created_at: string;
  items: OrderItem[];
};

export default function DebtPage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [debts, setDebts] = useState<DebtOrder[]>([]);
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState<string | null>(null);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth/login"); return; }

    const { data: orders } = await supabase
      .from("orders")
      .select(`id, total_price, paid_amount, payment_status, created_at, items:order_items(id, product_name, quantity, price)`)
      .eq("user_id", user.id)
      .eq("type", "dept")
      .neq("payment_status", "paid")
      .order("created_at", { ascending: true });

    const debtList = (orders ?? []) as DebtOrder[];
    setDebts(debtList);

    const defaults: Record<string, string> = {};
    for (const d of debtList) {
      defaults[d.id] = String(d.total_price - (d.paid_amount ?? 0));
    }
    setPayAmounts(defaults);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when the chatbot pays a debt
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener("debt-updated", handler);
    return () => window.removeEventListener("debt-updated", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalRemaining = debts.reduce(
    (sum, d) => sum + (d.total_price - (d.paid_amount ?? 0)),
    0,
  );

  const handlePay = async (debt: DebtOrder) => {
    const amount = parseFloat(payAmounts[debt.id] ?? "0");
    const remaining = debt.total_price - (debt.paid_amount ?? 0);

    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (amount > remaining) { toast.error(`Amount exceeds remaining debt (${remaining}K L.L)`); return; }

    setPaying(debt.id);
    try {
      const newPaid = (debt.paid_amount ?? 0) + amount;
      const isFullyPaid = newPaid >= debt.total_price;

      const { error } = await supabase
        .from("orders")
        .update({
          paid_amount: newPaid,
          payment_status: isFullyPaid ? "paid" : "partial",
          status: isFullyPaid ? "completed" : "pending",
        })
        .eq("id", debt.id);
      if (error) throw error;

      toast.success(isFullyPaid ? "Debt fully paid!" : `${amount}K L.L paid — debt updated`);
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-400">Loading your debts...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Debts</h1>
          <p className="text-sm text-gray-400 mt-0.5">Pay off your outstanding orders</p>
        </div>
        <Link href="/profile" className="text-sm text-[#1B2D72] hover:underline">
          ← Back to Profile
        </Link>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <p className="text-xs text-gray-400 mb-1">Total Outstanding</p>
        <p className="text-2xl font-bold text-orange-500">{totalRemaining}K L.L</p>
      </div>

      {debts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-14 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">All clear!</h2>
          <p className="text-sm text-gray-400">You have no outstanding debts.</p>
          <Link href="/" className="inline-flex items-center gap-2 mt-5 bg-[#1B2D72] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#00AECC] transition-colors">
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {debts.map((debt) => {
            const remaining = debt.total_price - (debt.paid_amount ?? 0);
            const paidPct = debt.paid_amount ? (debt.paid_amount / debt.total_price) * 100 : 0;
            const payAmount = parseFloat(payAmounts[debt.id] ?? "0");
            const canPay = payAmount > 0 && payAmount <= remaining;

            return (
              <div key={debt.id} className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
                {/* Order header */}
                <div className="px-5 py-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-gray-800">
                        #{debt.id.slice(0, 8)}
                      </span>
                      {debt.payment_status === "partial" ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-100">
                          Partial
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold border border-red-100">
                          Unpaid
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(debt.created_at).toLocaleDateString("en-US", {
                        year: "numeric", month: "short", day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900">{debt.total_price}K L.L</p>
                    <p className="text-xs text-orange-500 font-semibold mt-0.5">{remaining}K L.L due</p>
                  </div>
                </div>

                {/* Items */}
                <div className="border-t border-gray-50 px-5 py-3 bg-gray-50/50">
                  <div className="space-y-1">
                    {debt.items?.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm text-gray-600">
                        <span>{item.product_name} × {item.quantity}</span>
                        <span className="font-medium text-gray-800">{item.price * item.quantity}K L.L</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress bar */}
                {debt.paid_amount > 0 && (
                  <div className="px-5 py-3 border-t border-orange-50">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>Paid: {debt.paid_amount}K L.L</span>
                      <span>Remaining: {remaining}K L.L</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${paidPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Payment input */}
                <div className="px-5 py-4 border-t border-orange-50 bg-orange-50/30">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Pay toward this debt</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={1}
                        max={remaining}
                        value={payAmounts[debt.id] ?? ""}
                        onChange={(e) =>
                          setPayAmounts((prev) => ({ ...prev, [debt.id]: e.target.value }))
                        }
                        placeholder={`Max ${remaining}K`}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent pr-14"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">K L.L</span>
                    </div>
                    <button
                      onClick={() => handlePay(debt)}
                      disabled={!canPay || paying === debt.id}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 whitespace-nowrap"
                    >
                      {paying === debt.id ? "Paying..." : "Pay Now"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
