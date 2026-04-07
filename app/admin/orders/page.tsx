"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type OrderItem = { product_name: string; quantity: number; price: number };
type Order = { id: string; total_price: number; paid_amount: number; type: string; status: string; payment_status: string; created_at: string; user_id: string; user_name: string; user_email: string; items: OrderItem[] };

const PAYMENT_BADGE: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
  partial: "bg-amber-50 text-amber-700 border-amber-100",
  pending: "bg-red-50 text-red-600 border-red-100",
};

export default function OrdersPage() {
  const PAGE_SIZE = 20;
  const [orders, setOrders] = useState<Order[]>([]);
  const [filtered, setFiltered] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { checkAuthAndFetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { applyFilters(); }, [orders, typeFilter, statusFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCurrentPage(1); }, [typeFilter, statusFilter, search]);

  const checkAuthAndFetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") { toast.error("Admin access only"); router.push("/"); return; }
      await fetchOrders();
    } catch { router.push("/"); }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data: ordersData, error } = await supabase.from("orders")
        .select("id, total_price, paid_amount, type, status, payment_status, created_at, user_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!ordersData?.length) { setOrders([]); return; }

      const userIds = [...new Set(ordersData.map(o => o.user_id))];
      const { data: profilesData } = await supabase.from("profiles").select("id, name, email").in("id", userIds);

      const ordersWithDetails = await Promise.all(ordersData.map(async order => {
        const { data: itemsData } = await supabase.from("order_items").select("product_name, quantity, price").eq("order_id", order.id);
        const userProfile = profilesData?.find(p => p.id === order.user_id);
        return { ...order, user_name: userProfile?.name || "Unknown", user_email: userProfile?.email || "Unknown", items: itemsData || [] };
      }));
      setOrders(ordersWithDetails);
    } catch { toast.error("Failed to load orders"); }
    finally { setLoading(false); }
  };

  const applyFilters = () => {
    let result = [...orders];
    if (typeFilter !== "all") result = result.filter(o => o.type === typeFilter);
    if (statusFilter !== "all") result = result.filter(o => o.payment_status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o => o.user_name.toLowerCase().includes(q) || o.user_email.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
    }
    setFiltered(result);
  };

  const totalRevenue = orders.filter(o => o.payment_status === "paid").reduce((s, o) => s + o.total_price, 0);
  const pendingCount = orders.filter(o => o.payment_status !== "paid").length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paginatedOrders = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  if (loading) return (
    <div>
      <div className="mb-6"><div className="h-7 bg-gray-100 rounded w-32 animate-pulse" /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse"><div className="h-3 bg-gray-100 rounded w-2/3 mb-2" /><div className="h-7 bg-gray-100 rounded w-1/2" /></div>)}</div>
      <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-16 animate-pulse" />)}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} total orders</p>
        </div>
        <button onClick={fetchOrders} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Orders', value: orders.length, color: 'text-gray-900' },
          { label: 'Paid', value: orders.filter(o => o.payment_status === 'paid').length, color: 'text-emerald-600' },
          { label: 'Pending / Partial', value: pendingCount, color: 'text-amber-600' },
          { label: 'Revenue', value: `${totalRevenue}K L.L`, color: 'text-[#000080]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Search by name, email, or order ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] transition-all" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 bg-white">
          <option value="all">All Types</option>
          <option value="purchase">Purchase</option>
          <option value="dept">Debt</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 bg-white">
          <option value="all">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending</option>
        </select>
        <span className="text-xs text-gray-400">
          {filtered.length} of {orders.length} • Page {safePage} / {totalPages}
        </span>
      </div>

      {/* Orders */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400 font-medium">No orders found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedOrders.map(order => {
            const isExpanded = expandedId === order.id;
            const remaining = order.total_price - (order.paid_amount || 0);
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  className="w-full text-left px-5 py-3.5 hover:bg-gray-50/50 transition-colors flex flex-wrap items-center gap-3"
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                >
                  <span className="font-mono text-sm font-semibold text-gray-700">#{order.id.slice(0, 8)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PAYMENT_BADGE[order.payment_status] ?? 'bg-gray-50 text-gray-600 border-gray-100'}`}>
                    {order.payment_status}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-100 capitalize">{order.type}</span>
                  <span className="flex-1 text-sm text-gray-500 truncate">{order.user_name} <span className="text-gray-400">({order.user_email})</span></span>
                  <span className="font-bold text-gray-900 text-sm">{order.total_price}K L.L</span>
                  {order.type === "dept" && order.payment_status !== "paid" && (
                    <span className="text-xs text-red-500">Due: {remaining}K L.L</span>
                  )}
                  <span className="text-xs text-gray-400 hidden sm:block">{new Date(order.created_at).toLocaleDateString()}</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-50 px-5 py-4 bg-gray-50/30">
                    <p className="text-xs text-gray-400 mb-3">{new Date(order.created_at).toLocaleString()}</p>
                    <div className="space-y-1.5">
                      {order.items.length === 0 ? <p className="text-sm text-gray-400">No items found.</p> : order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-700">{item.product_name} <span className="text-gray-400">× {item.quantity}</span></span>
                          <span className="font-medium text-gray-900">{(item.price * item.quantity).toFixed(2)}K L.L</span>
                        </div>
                      ))}
                    </div>
                    {order.type === "dept" && order.paid_amount > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min((order.paid_amount / order.total_price) * 100, 100)}%` }} />
                        </div>
                        <p className="text-xs text-gray-400">Paid {order.paid_amount}K of {order.total_price}K L.L ({((order.paid_amount / order.total_price) * 100).toFixed(0)}%)</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
