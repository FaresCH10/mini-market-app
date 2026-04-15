'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { formatLira, kToLira, liraToK } from '@/lib/currency'

type Product = {
  id: string
  name: string
  price: number
  sell_price: number | null
  quantity: number
  image_url: string | null
}

type EditableRow = {
  id: string
  name: string
  price_usd: string
  price_lira: string
  sell_price_lira: string
  quantity: string
  image_url: string
  dirty: boolean
  saving: boolean
}

const DEFAULT_EXCHANGE_RATE = 90_000
const EXCHANGE_RATE_STORAGE_KEY = 'mm_exchange_rate'

export default function ProductsEditPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [initialRows, setInitialRows] = useState<Record<string, EditableRow>>({})
  const [search, setSearch] = useState('')
  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_EXCHANGE_RATE
    return Number(localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY)) || DEFAULT_EXCHANGE_RATE
  })
  const [rateInput, setRateInput] = useState<string>(() => {
    if (typeof window === 'undefined') return String(DEFAULT_EXCHANGE_RATE)
    return String(Number(localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY)) || DEFAULT_EXCHANGE_RATE)
  })

  const router = useRouter()
  const supabase = createClient()

  const applyExchangeRate = (rate: number) => {
    setExchangeRate(rate)
    setRateInput(String(rate))
    localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, String(rate))
  }

  const toEditableRow = (product: Product, rate: number): EditableRow => {
    const baseLira = kToLira(product.price)
    return {
      id: product.id,
      name: product.name,
      price_usd: (baseLira / rate).toFixed(2),
      price_lira: String(baseLira),
      sell_price_lira: String(kToLira(product.sell_price ?? Number((product.price * 1.2).toFixed(2)))),
      quantity: String(product.quantity),
      image_url: product.image_url ?? '',
      dirty: false,
      saving: false,
    }
  }

  const fetchDollarRateFromSettings = async (): Promise<number | null> => {
    let row: Record<string, unknown> | null = null

    const primary = await supabase
      .from('settings')
      .select('key, dollar_rate, value')
      .eq('key', 'dollar_rate')
      .maybeSingle()

    if (!primary.error) {
      row = (primary.data as Record<string, unknown> | null) ?? null
    } else {
      const fallback = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'dollar_rate')
        .maybeSingle()
      if (fallback.error) throw fallback.error
      row = (fallback.data as Record<string, unknown> | null) ?? null
    }

    if (!row) return null
    const rawRate = row.dollar_rate ?? row.value
    const parsed = Number(rawRate)
    if (!Number.isFinite(parsed) || parsed <= 0) return null

    applyExchangeRate(parsed)
    return parsed
  }

  const fetchProducts = async (rate: number) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, sell_price, quantity, image_url')
        .order('name', { ascending: true })
      if (error) throw error

      const mapped = ((data ?? []) as Product[]).map((p) => toEditableRow(p, rate))
      setRows(mapped)
      setInitialRows(Object.fromEntries(mapped.map((r) => [r.id, r])))
    } catch {
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role !== 'admin') {
          toast.error('Admin access only')
          router.push('/')
          return
        }

        setIsAdmin(true)

        const dbRate = await fetchDollarRateFromSettings()
        const rateToUse = dbRate ?? (Number(localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY)) || DEFAULT_EXCHANGE_RATE)

        if (!dbRate) applyExchangeRate(rateToUse)
        await fetchProducts(rateToUse)
      } catch {
        router.push('/')
      }
    }

    checkAdmin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getBaseLira = (row: EditableRow) => {
    const lira = parseFloat(row.price_lira)
    if (!Number.isFinite(lira) || lira <= 0) return 0
    return lira
  }

  const updateRow = (id: string, updater: (row: EditableRow) => EditableRow) => {
    setRows((prev) => prev.map((r) => (r.id === id ? updater(r) : r)))
  }

  const handleUsdChange = (id: string, value: string) => {
    updateRow(id, (row) => {
      const usd = parseFloat(value)
      const baseLira = Number.isFinite(usd) && usd > 0 ? Math.round(usd * exchangeRate) : 0
      return {
        ...row,
        price_usd: value,
        price_lira: baseLira > 0 ? String(baseLira) : '',
        sell_price_lira: baseLira > 0 ? String(Math.round(baseLira * 1.2)) : '',
        dirty: true,
      }
    })
  }

  const handleLiraChange = (id: string, value: string) => {
    updateRow(id, (row) => {
      const lira = parseFloat(value)
      const usd = Number.isFinite(lira) && lira > 0 ? (lira / exchangeRate).toFixed(2) : ''
      return {
        ...row,
        price_lira: value,
        price_usd: usd,
        sell_price_lira: Number.isFinite(lira) && lira > 0 ? String(Math.round(lira * 1.2)) : '',
        dirty: true,
      }
    })
  }

  const saveRate = async () => {
    const r = Number(rateInput)
    if (!Number.isFinite(r) || r <= 0) {
      toast.error('Please enter a valid dollar rate')
      return
    }

    applyExchangeRate(r)

    const primary = await supabase
      .from('settings')
      .upsert({ key: 'dollar_rate', dollar_rate: r }, { onConflict: 'key' })

    if (primary.error) {
      const fallback = await supabase
        .from('settings')
        .upsert({ key: 'dollar_rate', value: r }, { onConflict: 'key' })
      if (fallback.error) {
        toast.error('Failed to save dollar rate')
        return
      }
    }

    await fetchProducts(r)
    toast.success('Dollar rate updated')
  }

  const resetRow = (id: string) => {
    const original = initialRows[id]
    if (!original) return
    setRows((prev) => prev.map((r) => (r.id === id ? { ...original } : r)))
  }

  const saveRow = async (id: string) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return

    const baseLira = getBaseLira(row)
    const quantity = parseInt(row.quantity, 10)
    const sellLira = parseFloat(row.sell_price_lira)

    if (!row.name.trim()) {
      toast.error('Product name is required')
      return
    }
    if (!Number.isFinite(baseLira) || baseLira <= 0) {
      toast.error('Enter a valid USD price')
      return
    }
    if (!Number.isFinite(sellLira) || sellLira <= 0) {
      toast.error('Enter a valid sell price')
      return
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error('Enter a valid quantity')
      return
    }

    updateRow(id, (r) => ({ ...r, saving: true }))

    const payload = {
      name: row.name.trim(),
      price: liraToK(baseLira),
      sell_price: liraToK(sellLira),
      quantity,
      image_url: row.image_url.trim() || null,
    }

    try {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', id)

      if (error) throw error

      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, quantity: String(quantity), dirty: false, saving: false }
            : r,
        ),
      )
      setInitialRows((prev) => ({
        ...prev,
        [id]: {
          ...row,
          quantity: String(quantity),
          image_url: row.image_url.trim(),
          dirty: false,
          saving: false,
        },
      }))
      toast.success('Product updated')
    } catch {
      updateRow(id, (r) => ({ ...r, saving: false }))
      toast.error('Failed to update product')
    }
  }

  if (!isAdmin) return null
  const filteredRows = rows.filter((row) =>
    row.name.toLowerCase().includes(search.toLowerCase().trim()),
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Products Table</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {search.trim()
              ? `${filteredRows.length} of ${rows.length} products`
              : 'Inline editing for all products with automatic USD/L.L calculations'}
          </p>
          <div className="relative mt-3 w-full max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2D72]/20 focus:border-[#1B2D72] transition-all"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 bg-white text-sm">
            <span className="text-gray-500 text-xs font-medium whitespace-nowrap">Rate:</span>
            <input
              type="number"
              min={1}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={saveRate}
              onKeyDown={(e) => e.key === 'Enter' && saveRate()}
              className="w-20 border-0 text-xs text-gray-700 font-semibold focus:outline-none bg-transparent"
            />
            <span className="text-gray-400 text-xs">L.L/$</span>
          </div>
          <Link
            href="/admin/products"
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back to Products
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-sm text-gray-400">Loading products...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <p className="font-semibold text-gray-700">No products found</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <p className="font-semibold text-gray-700">No matching products</p>
          <p className="text-sm text-gray-400 mt-1">Try a different product name.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Price ($)</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Base (L.L)</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Sell (L.L)</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Qty</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Image URL</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row) => {
                const baseLira = getBaseLira(row)
                return (
                  <tr key={row.id} className={row.dirty ? 'bg-amber-50/30' : ''}>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(row.id, (r) => ({ ...r, name: e.target.value, dirty: true }))}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.price_usd}
                        onChange={(e) => handleUsdChange(row.id, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={row.price_lira}
                        onChange={(e) => handleLiraChange(row.id, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">{formatLira(liraToK(baseLira || 0))}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={row.sell_price_lira}
                        onChange={(e) => updateRow(row.id, (r) => ({ ...r, sell_price_lira: e.target.value, dirty: true }))}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        value={row.quantity}
                        onChange={(e) => updateRow(row.id, (r) => ({ ...r, quantity: e.target.value, dirty: true }))}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="url"
                        value={row.image_url}
                        onChange={(e) => updateRow(row.id, (r) => ({ ...r, image_url: e.target.value, dirty: true }))}
                        placeholder="https://example.com/image.jpg"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => resetRow(row.id)}
                          disabled={!row.dirty || row.saving}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => saveRow(row.id)}
                          disabled={!row.dirty || row.saving}
                          className="px-3 py-1.5 rounded-lg bg-[#1B2D72] text-white text-xs font-semibold hover:bg-[#00AECC] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {row.saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
