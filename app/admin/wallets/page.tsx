"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Profile = { id: string; name: string; email: string; role: string; wallet_balance: number };

export default function WalletsPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [debtUserIds, setDebtUserIds] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { checkAuthAndFetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const q = search.toLowerCase().trim();
    setFiltered(!q ? users : users.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)));
  }, [search, users]);

  const checkAuthAndFetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") { toast.error("Admin access only"); router.push("/"); return; }
      await fetchUsers();
    } catch { router.push("/"); }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [{ data, error }, { data: debtOrders, error: debtError }] = await Promise.all([
        supabase.from("profiles").select("id, name, email, role, wallet_balance").order("name", { ascending: true }),
        supabase.from("orders").select("user_id").eq("type", "dept").neq("payment_status", "paid"),
      ]);
      if (error) throw error;
      if (debtError) throw debtError;
      setUsers(data || []);
      const uniqueDebtUserIds = [...new Set((debtOrders || []).map((o) => o.user_id as string))];
      setDebtUserIds(uniqueDebtUserIds);
    } catch { toast.error("Failed to load users"); }
    finally { setLoading(false); }
  };

  const saveBalance = async (userId: string) => {
    if (debtUserIds.includes(userId)) {
      toast.error("Cannot edit wallet while user has unpaid debt");
      return;
    }
    const newBalance = parseFloat(editValue);
    if (isNaN(newBalance) || newBalance < 0) { toast.error("Invalid balance"); return; }
    setSavingId(userId);
    try {
      const { error } = await supabase.from("profiles").update({ wallet_balance: newBalance }).eq("id", userId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, wallet_balance: newBalance } : u));
      toast.success("Balance updated");
      setEditingId(null);
    } catch { toast.error("Failed to update balance"); }
    finally { setSavingId(null); }
  };

  const totalBalance = users.reduce((s, u) => s + (u.wallet_balance ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage user wallet balances</p>
        </div>
        <button onClick={fetchUsers} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Users', value: users.length, color: 'text-gray-900' },
          { label: 'Total Funds', value: `${totalBalance}K L.L`, color: 'text-[#000080]' },
          { label: 'Avg Balance', value: `${users.length > 0 ? (totalBalance / users.length).toFixed(1) : 0}K L.L`, color: 'text-emerald-600' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] transition-all" />
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-2"><div className="h-3.5 bg-gray-100 rounded w-1/4" /><div className="h-3 bg-gray-100 rounded w-1/3" /></div>
              <div className="w-20 h-7 bg-gray-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No users found.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((user) => {
                const isEditing = editingId === user.id;
                const isSaving = savingId === user.id;
                const hasDebt = debtUserIds.includes(user.id);
                const initials = (user.name || user.email || 'U').slice(0, 2).toUpperCase();
                return (
                  <div key={user.id} className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${isEditing ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'}`}>
                    <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{user.name || 'No name'}</p>
                      <p className="text-xs text-gray-400 truncate">{user.email}</p>
                    </div>
                    <span className={`hidden sm:inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-[#000080]/10 text-[#000080]' : 'bg-gray-100 text-gray-500'}`}>
                      {user.role || 'user'}
                    </span>

                    {/* Balance cell */}
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" step="0.01" value={editValue} autoFocus disabled={isSaving}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveBalance(user.id); if (e.key === 'Escape') { setEditingId(null); setEditValue(''); } }}
                          className="w-28 border border-[#000080]/30 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20"
                        />
                        <span className="text-xs text-gray-400">K L.L</span>
                        <button onClick={() => saveBalance(user.id)} disabled={isSaving} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                          {isSaving ? '…' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingId(null); setEditValue(''); }} disabled={isSaving} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm text-emerald-700 min-w-[80px] text-right">{user.wallet_balance ?? 0}K L.L</span>
                        {hasDebt ? (
                          <span className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-xs font-semibold">
                            Has debt
                          </span>
                        ) : (
                          <button onClick={() => { setEditingId(user.id); setEditValue(String(user.wallet_balance ?? 0)); }} className="px-3 py-1.5 rounded-lg bg-[#000080]/5 text-[#000080] border border-[#000080]/10 text-xs font-semibold hover:bg-[#000080]/10 transition-colors">
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
