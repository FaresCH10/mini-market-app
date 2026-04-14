'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Stats = {
  products: number
  users: number
  totalOrders: number
  pendingDebt: number
  revenue: number
  outstandingDebt: number
}

export default function AdminDashboard() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [stats, setStats] = useState<Stats>({
    products: 0, users: 0, totalOrders: 0,
    pendingDebt: 0, revenue: 0, outstandingDebt: 0,
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }
        const { data: profile } = await supabase
          .from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') { router.push('/'); return }
        setIsAdmin(true)
        fetchStats()
      } catch { router.push('/') }
    }
    checkAdmin()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStats = async () => {
    try {
      const [
        { count: productsCount },
        { count: usersCount },
        { count: totalOrders },
        { count: pendingDebt },
        { data: paidOrders },
        { data: debtOrders },
      ] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('type', 'dept').neq('payment_status', 'paid'),
        supabase.from('orders').select('id, total_price')
          .eq('payment_status', 'paid')
          .order('created_at', { ascending: false }),
        supabase.from('orders').select('total_price, paid_amount')
          .eq('type', 'dept').neq('payment_status', 'paid'),
      ])

      const paidOrderIds = (paidOrders ?? []).map((o) => o.id)
      let revenue = 0
      if (paidOrderIds.length > 0) {
        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, quantity, price')
          .in('order_id', paidOrderIds)

        const productIds = [...new Set((items ?? []).map((it) => it.product_id).filter(Boolean))]
        const { data: productRows } = productIds.length > 0
          ? await supabase.from('products').select('id, price, sell_price').in('id', productIds)
          : { data: [] as { id: string; price: number; sell_price: number | null }[] }

        const byId = new Map((productRows ?? []).map((p) => [p.id as string, p]))
        revenue = (items ?? []).reduce((sum, item) => {
          const product = byId.get(item.product_id)
          const sellPrice = Number(product?.sell_price ?? item.price ?? product?.price ?? 0)
          const basePrice = product
            ? Number(product.price ?? 0)
            : Number((sellPrice / 1.2).toFixed(2))
          const qty = Number(item.quantity ?? 0)
          return sum + Math.max(0, sellPrice - basePrice) * qty
        }, 0)
      }
      const outstandingDebt = debtOrders?.reduce(
        (s, o) => s + (o.total_price - (o.paid_amount ?? 0)), 0
      ) ?? 0
      setStats({
        products: productsCount ?? 0,
        users: usersCount ?? 0,
        totalOrders: totalOrders ?? 0,
        pendingDebt: pendingDebt ?? 0,
        revenue,
        outstandingDebt,
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  if (!isAdmin) return null

  const statCards = [
    {
      label: 'Total Revenue',
      value: `${stats.revenue}K L.L`,
      sub: 'sell price - base price on all paid orders',
      href: '/admin/orders',
      color: 'from-emerald-500 to-emerald-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Outstanding Debt',
      value: `${stats.outstandingDebt}K L.L`,
      sub: `${stats.pendingDebt} unpaid orders`,
      href: '/admin/debt',
      color: 'from-orange-500 to-orange-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      label: 'Total Orders',
      value: stats.totalOrders,
      sub: 'all time',
      href: '/admin/orders',
      color: 'from-blue-500 to-blue-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      label: 'Products',
      value: stats.products,
      sub: 'in catalogue',
      href: '/admin/products',
      color: 'from-violet-500 to-violet-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: 'Users',
      value: stats.users,
      sub: 'registered',
      href: '/admin/users',
      color: 'from-pink-500 to-pink-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ]

  const quickLinks = [
    { href: '/admin/products', label: 'Add Product', desc: 'Add or import new products', color: 'bg-violet-50 border-violet-100 text-violet-700 hover:bg-violet-100' },
    { href: '/admin/debt', label: 'Collect Payments', desc: 'Process outstanding debts', color: 'bg-orange-50 border-orange-100 text-orange-700 hover:bg-orange-100' },
    // { href: '/admin/wallets', label: 'Manage Wallets', desc: 'Adjust user balances', color: 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100' },
    { href: '/admin/orders', label: 'View Orders', desc: 'Browse all order history', color: 'bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your store</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} text-white flex items-center justify-center shadow-sm`}>
                {card.icon}
              </div>
              <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm font-medium text-gray-600 mt-0.5">{card.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`border rounded-2xl p-4 transition-all ${link.color}`}
            >
              <p className="font-semibold text-sm">{link.label}</p>
              <p className="text-xs mt-1 opacity-70">{link.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
