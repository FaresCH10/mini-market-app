"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { formatLira } from "@/lib/currency";

type RevenueRow = {
  date: string;
  revenue: number;
};

export default function RevenueHistoryPage() {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/revenue-history");
      const body = (await res.json()) as { history?: RevenueRow[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load revenue history");
      setRows(body.history ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load revenue history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const formatDay = (dateKey: string) => {
    const dt = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return dateKey;
    return dt.toLocaleDateString();
  };

  const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const averageRevenue = rows.length > 0 ? totalRevenue / rows.length : 0;
  const topDay = rows.reduce<RevenueRow | null>((best, row) => {
    if (!best) return row;
    return row.revenue > best.revenue ? row : best;
  }, null);

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <div className="h-7 bg-gray-100 rounded w-52 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100 animate-pulse" />
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 shadow-sm">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-gradient-to-r from-[#1B2D72] to-[#2E4FC7] rounded-2xl px-5 py-5 sm:px-6 sm:py-6 text-white mb-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Revenue History</h1>
            <p className="text-xs sm:text-sm text-white/85 mt-0.5">Daily revenue by Beirut business day (1:00 AM reset)</p>
          </div>
          <button
            onClick={fetchHistory}
            className="w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2 rounded-xl border border-white/30 bg-white/10 text-sm font-medium text-white hover:bg-white/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Total Revenue</p>
          <p className="text-xl font-bold text-[#1B2D72]">{formatLira(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Average / Day</p>
          <p className="text-xl font-bold text-gray-900">{formatLira(averageRevenue)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Best Day</p>
          {topDay ? (
            <>
              <p className="text-base font-bold text-emerald-600">{formatLira(topDay.revenue)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatDay(topDay.date)}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">No data yet</p>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="font-semibold text-gray-700">No revenue history yet</p>
          <p className="text-sm text-gray-400 mt-1">Daily revenue rows will appear after order payments are recorded.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={row.date} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}>
                  <td className="px-4 py-3 text-gray-700">{formatDay(row.date)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatLira(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-100">
              <tr>
                <td className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-[#1B2D72]">{formatLira(totalRevenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
