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

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <div className="h-7 bg-gray-100 rounded w-40 animate-pulse" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenue History</h1>
          <p className="text-sm text-gray-500 mt-0.5">Daily revenue by Beirut business day (1:00 AM reset)</p>
        </div>
        <button
          onClick={fetchHistory}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="font-semibold text-gray-700">No revenue history yet</p>
          <p className="text-sm text-gray-400 mt-1">Daily revenue rows will appear after paid orders are recorded.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.date}>
                  <td className="px-4 py-3 text-gray-700">{formatDay(row.date)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatLira(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
