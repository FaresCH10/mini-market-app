"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { formatLira } from "@/lib/currency";

type OrderItem = { product_name: string; quantity: number; price: number };
type Order = {
  id: string;
  total_price: number;
  paid_amount: number;
  type: string;
  status: string;
  payment_status: string;
  created_at: string;
  user_id: string;
  items: OrderItem[];
};
type UserYield = {
  user_id: string;
  user_name: string;
  user_email: string;
  orders: Order[];
  total_spent: number;
  total_paid: number;
};

const PAYMENT_BADGE: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
  partial: "bg-amber-50 text-amber-700 border-amber-100",
  pending: "bg-red-50 text-red-600 border-red-100",
};

export default function TodaysYieldPage() {
  const [users, setUsers] = useState<UserYield[]>([]);
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { checkAuthAndFetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkAuthAndFetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") { toast.error("Admin access only"); router.push("/"); return; }
      await fetchYield();
    } catch { router.push("/"); }
  };

  const fetchYield = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/today-yield");
      const body = await res.json() as { users?: UserYield[]; cutoff?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load today's yield");
      setUsers(body.users ?? []);
      setCutoff(body.cutoff ?? null);
    } catch { toast.error("Failed to load today's yield"); }
    finally { setLoading(false); }
  };

  const totalOrders = users.reduce((s, u) => s + u.orders.length, 0);
  const grandTotal = users.reduce((s, u) => s + u.total_spent, 0);
  const grandPaid = users.reduce((s, u) => s + u.total_paid, 0);
  const grandDebt = grandTotal - grandPaid;

  const cutoffDate = cutoff ? new Date(cutoff) : null;
  const cutoffLabel = cutoffDate
    ? cutoffDate.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  if (loading) return (
    <div>
      <div className="mb-6">
        <div className="h-7 bg-gray-100 rounded w-48 animate-pulse mb-1" />
        <div className="h-4 bg-gray-100 rounded w-32 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-2/3 mb-2" />
            <div className="h-7 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse" />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Today&apos;s Yield</h1>
          {cutoffLabel && (
            <p className="text-sm text-gray-400 mt-0.5">Since {cutoffLabel} · resets daily at 1:00 AM</p>
          )}
        </div>
        <button
          onClick={fetchYield}
          className="w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[
          { label: "Customers", value: users.length, color: "text-gray-900" },
          { label: "Orders", value: totalOrders, color: "text-gray-900" },
          { label: "Total Earned", value: formatLira(grandTotal), color: "text-[#1B2D72]" },
          { label: "Outstanding", value: formatLira(grandDebt), color: grandDebt > 0 ? "text-red-500" : "text-emerald-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* User list */}
      {users.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No activity yet today</p>
          <p className="text-sm text-gray-400 mt-1">Purchases and debts will appear here as they come in.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const isUserExpanded = expandedUser === u.user_id;
            const initials = u.user_name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
            const hasDebt = u.total_paid < u.total_spent;

            return (
              <div key={u.user_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* User row */}
                <button
                  className="w-full text-left px-4 sm:px-5 py-4 hover:bg-gray-50/50 transition-colors"
                  onClick={() => {
                    setExpandedUser(isUserExpanded ? null : u.user_id);
                    setExpandedOrder(null);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-xl bg-[#1B2D72]/10 text-[#1B2D72] flex items-center justify-center font-bold text-sm shrink-0">
                        {initials}
                      </div>

                      {/* Name + email */}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{u.user_name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.user_email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-gray-900 text-sm">{formatLira(u.total_spent)}</span>
                      <svg
                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isUserExpanded ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/* Order count badge */}
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                      {u.orders.length} {u.orders.length === 1 ? "order" : "orders"}
                    </span>

                    {/* Debt indicator */}
                    {hasDebt && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100 shrink-0">
                        Debt: {formatLira(u.total_spent - u.total_paid)}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded: orders list */}
                {isUserExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/30 px-4 sm:px-5 py-4 space-y-2">
                    {u.orders.map((order) => {
                      const isOrderExpanded = expandedOrder === order.id;
                      const remaining = order.total_price - (order.paid_amount ?? 0);
                      return (
                        <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                          <button
                            className="w-full text-left px-4 py-3 hover:bg-gray-50/50 transition-colors"
                            onClick={() => setExpandedOrder(isOrderExpanded ? null : order.id)}
                          >
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-gray-500">#{order.id.slice(0, 8)}</span>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PAYMENT_BADGE[order.payment_status] ?? "bg-gray-50 text-gray-600 border-gray-100"}`}>
                                  {order.payment_status}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{order.type}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-bold text-sm text-gray-900">{formatLira(order.total_price)}</span>
                                <svg
                                  className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOrderExpanded ? "rotate-180" : ""}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                              {order.type === "dept" && order.payment_status !== "paid" && remaining > 0 && (
                                <span className="text-xs text-red-500">Due: {formatLira(remaining)}</span>
                              )}
                            </div>
                          </button>

                          {/* Order items */}
                          {isOrderExpanded && (
                            <div className="border-t border-gray-50 px-4 py-3 bg-gray-50/50">
                              {order.items.length === 0 ? (
                                <p className="text-xs text-gray-400">No items found.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {order.items.map((item, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                      <span className="text-gray-700">
                                        {item.product_name}
                                        <span className="text-gray-400 ml-1.5">× {item.quantity}</span>
                                      </span>
                                      <span className="font-medium text-gray-900">
                                        {formatLira(item.price * item.quantity)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Payment progress for debt orders */}
                              {order.type === "dept" && (order.paid_amount ?? 0) > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                                    <div
                                      className="bg-emerald-500 h-1.5 rounded-full"
                                      style={{ width: `${Math.min(((order.paid_amount ?? 0) / order.total_price) * 100, 100)}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-gray-400">
                                    Paid {formatLira(order.paid_amount ?? 0)} of {formatLira(order.total_price)} ({(((order.paid_amount ?? 0) / order.total_price) * 100).toFixed(0)}%)
                                  </p>
                                </div>
                              )}

                              {/* Order total row */}
                              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                                <span className="text-xs text-gray-400 font-medium">Order Total</span>
                                <span className="font-bold text-gray-900 text-sm">{formatLira(order.total_price)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* User summary footer */}
                    <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        <div>
                          <p className="text-xs text-gray-400">Total Spent</p>
                          <p className="font-bold text-[#1B2D72] text-sm">{formatLira(u.total_spent)}</p>
                        </div>
                        {u.total_paid < u.total_spent && (
                          <div>
                            <p className="text-xs text-gray-400">Paid</p>
                            <p className="font-semibold text-emerald-600 text-sm">{formatLira(u.total_paid)}</p>
                          </div>
                        )}
                        {u.total_paid < u.total_spent && (
                          <div>
                            <p className="text-xs text-gray-400">Remaining Debt</p>
                            <p className="font-semibold text-red-500 text-sm">{formatLira(u.total_spent - u.total_paid)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Grand total footer */}
      {users.length > 0 && (
        <div className="mt-6 bg-[#1B2D72] rounded-2xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-white">
          <div>
            <p className="text-xs text-white/60 uppercase tracking-wider font-medium mb-0.5">Grand Total</p>
            <p className="text-2xl font-bold">{formatLira(grandTotal)}</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-white/60 mb-0.5">Collected</p>
              <p className="font-bold text-emerald-400">{formatLira(grandPaid)}</p>
            </div>
            {grandDebt > 0 && (
              <div>
                <p className="text-xs text-white/60 mb-0.5">Outstanding</p>
                <p className="font-bold text-red-300">{formatLira(grandDebt)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
