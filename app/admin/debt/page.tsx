"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type DebtOrder = { id: string; total_price: number; paid_amount: number; payment_status: string; status: string; created_at: string; user_name: string; user_email: string; user_id: string; items: any[] };

export default function DebtPage() {
  const [orders, setOrders] = useState<DebtOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<{ [key: string]: number }>({});
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { checkAuthAndFetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkAuthAndFetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") { toast.error("Admin access only"); router.push("/"); return; }
      await fetchDebtOrders();
    } catch { router.push("/"); }
  };

  const fetchDebtOrders = async () => {
    setLoading(true);
    try {
      const { data: ordersData, error } = await supabase.from("orders")
        .select("id, total_price, paid_amount, payment_status, status, created_at, user_id")
        .eq("type", "dept").neq("payment_status", "paid").order("created_at", { ascending: true });
      if (error) throw error;
      if (!ordersData?.length) { setOrders([]); setLoading(false); return; }

      const userIds = ordersData.map(o => o.user_id);
      const { data: profilesData } = await supabase.from("profiles").select("id, name, email").in("id", userIds);

      const ordersWithDetails = await Promise.all(ordersData.map(async order => {
        const { data: itemsData } = await supabase.from("order_items").select("product_name, quantity, price").eq("order_id", order.id);
        const userProfile = profilesData?.find(p => p.id === order.user_id);
        return { ...order, user_name: userProfile?.name || "Unknown", user_email: userProfile?.email || "Unknown", items: itemsData || [] };
      }));
      setOrders(ordersWithDetails);
    } catch { toast.error("Failed to load debts"); }
    finally { setLoading(false); }
  };

  const creditUserWallet = async (userId: string, amount: number) => {
    if (amount <= 0) return;
    const { data: profile, error: fetchError } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", userId)
      .single();
    if (fetchError) throw fetchError;

    const currentBalance = profile?.wallet_balance || 0;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ wallet_balance: currentBalance + amount })
      .eq("id", userId);
    if (updateError) throw updateError;
  };

  const handleFullPayment = async (orderId: string, totalAmount: number) => {
    const currentOrder = orders.find((o) => o.id === orderId);
    if (!currentOrder) {
      toast.error("Order not found");
      return;
    }
    const paymentAmount = Math.max(0, totalAmount - (currentOrder.paid_amount || 0));
    if (paymentAmount <= 0) {
      toast.error("This order is already fully paid");
      return;
    }

    setProcessingId(orderId);
    try {
      const { error } = await supabase.from("orders").update({ payment_status: "paid", paid_amount: totalAmount, status: "completed" }).eq("id", orderId);
      if (error) throw error;
      await creditUserWallet(currentOrder.user_id, paymentAmount);
      toast.success("Full payment recorded!");
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch { toast.error("Failed to process payment"); }
    finally { setProcessingId(null); }
  };

  const handlePartialPayment = async (orderId: string, totalAmount: number) => {
    const amount = paymentAmount[orderId];
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    const currentOrder = orders.find(o => o.id === orderId);
    if (!currentOrder) { toast.error("Order not found"); return; }
    const newPaid = (currentOrder?.paid_amount || 0) + amount;
    const isFullyPaid = newPaid >= totalAmount;
    setProcessingId(orderId);
    try {
      const { error } = await supabase.from("orders").update({
        paid_amount: newPaid,
        payment_status: isFullyPaid ? "paid" : "partial",
        status: isFullyPaid ? "completed" : "pending",
      }).eq("id", orderId);
      if (error) throw error;
      await creditUserWallet(currentOrder.user_id, amount);
      if (isFullyPaid) {
        toast.success("Order fully paid!");
        setOrders(prev => prev.filter(o => o.id !== orderId));
      } else {
        toast.success(`Payment of ${amount}K L.L recorded`);
        await fetchDebtOrders();
      }
    } catch { toast.error("Failed to process payment"); }
    finally { setProcessingId(null); setPaymentAmount(prev => ({ ...prev, [orderId]: 0 })); }
  };

  const getRemaining = (order: DebtOrder) => order.total_price - (order.paid_amount || 0);
  const totalOutstanding = orders.reduce((s, o) => s + getRemaining(o), 0);

  if (loading) return (
    <div>
      <div className="mb-6"><div className="h-7 bg-gray-100 rounded w-40 animate-pulse" /></div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4 animate-pulse"><div className="h-8 bg-gray-100 rounded w-1/3" /></div>
      <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-32 animate-pulse" />)}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debt Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} unpaid orders</p>
        </div>
        <button onClick={fetchDebtOrders} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="font-semibold text-gray-800">All debts cleared!</p>
          <p className="text-sm text-gray-400 mt-1">No pending payments at the moment.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Outstanding Debt</p>
              <p className="text-2xl font-bold text-orange-600">{totalOutstanding}K L.L</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Pending Orders</p>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>
          </div>

          {/* Debt Orders */}
          <div className="space-y-4">
            {orders.map(order => {
              const remaining = getRemaining(order);
              const isProcessing = processingId === order.id;
              const paidPct = ((order.paid_amount || 0) / order.total_price) * 100;
              return (
                <div key={order.id} className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
                  {/* Header */}
                  <div className="px-5 py-4 border-b border-gray-50">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-bold text-gray-800">#{order.id.slice(0, 8)}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${order.payment_status === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                            {order.payment_status}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-700">{order.user_name} <span className="text-gray-400 font-normal">({order.user_email})</span></p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Total: {order.total_price}K L.L</p>
                        {order.paid_amount > 0 && <p className="text-sm text-emerald-600">Paid: {order.paid_amount}K L.L</p>}
                        <p className="text-xl font-bold text-red-600 mt-0.5">{remaining}K L.L due</p>
                      </div>
                    </div>

                    {order.paid_amount > 0 && (
                      <div className="mt-3">
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{paidPct.toFixed(0)}% paid</p>
                      </div>
                    )}
                  </div>

                  {/* Items */}
                  <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Items</p>
                    <div className="space-y-1">
                      {order.items?.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-600">{item.product_name} <span className="text-gray-400">× {item.quantity}</span></span>
                          <span className="font-medium text-gray-800">{(item.price * item.quantity).toFixed(2)}K L.L</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment actions */}
                  <div className="px-5 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        onClick={() => handleFullPayment(order.id, order.total_price)}
                        disabled={isProcessing}
                        className="py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {isProcessing ? "Processing…" : `Pay Full (${remaining}K L.L)`}
                      </button>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number" step="0.01" min="0.01" max={remaining}
                            value={paymentAmount[order.id] || ""}
                            onChange={e => setPaymentAmount({ ...paymentAmount, [order.id]: parseFloat(e.target.value) || 0 })}
                            placeholder="Partial amount"
                            disabled={isProcessing}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] transition-all pr-14"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">K L.L</span>
                        </div>
                        <button
                          onClick={() => handlePartialPayment(order.id, order.total_price)}
                          disabled={isProcessing || !paymentAmount[order.id] || paymentAmount[order.id] <= 0}
                          className="px-4 py-2.5 rounded-xl bg-[#000080] text-white text-sm font-semibold hover:bg-[#1F51FF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {isProcessing ? "…" : "Pay"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
