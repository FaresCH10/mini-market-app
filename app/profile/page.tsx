import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const ORDERS_PER_PAGE = 5

type OrderItem = { id: string; product_name: string; quantity: number; price: number }
type Order = {
  id: string; type: string; total_price: number; payment_status: string;
  paid_amount: number | null; created_at: string; items: OrderItem[]
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const from = (page - 1) * ORDERS_PER_PAGE
  const to = from + ORDERS_PER_PAGE - 1

  const [{ data: profile }, { data: allOrders }, { data: orders, count }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    // Lightweight query for stats (no items join)
    supabase.from('orders').select('total_price, payment_status, paid_amount, type').eq('user_id', user.id),
    // Paginated query with items
    supabase
      .from('orders')
      .select('*, items:order_items(*)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to),
  ])

  const totalOrders = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalOrders / ORDERS_PER_PAGE))

  const totalSpent = allOrders?.filter(o => o.payment_status === 'paid')
    .reduce((sum, o) => sum + o.total_price, 0) ?? 0

  const pendingDebt = allOrders?.filter(o => o.payment_status !== 'paid' && o.type === 'dept')
    .reduce((sum, o) => sum + (o.total_price - (o.paid_amount ?? 0)), 0) ?? 0

  const initials = (profile?.name || user.email || 'U').slice(0, 2).toUpperCase()

  const getStatusBadge = (order: Order) => {
    if (order.type === 'purchase' || order.payment_status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Paid
        </span>
      )
    }
    if (order.payment_status === 'partial') {
      const remaining = order.total_price - (order.paid_amount ?? 0)
      return (
        <div className="text-right">
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-100">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Partial — {remaining}K L.L due
          </span>
        </div>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-semibold border border-red-100">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Unpaid Debt
      </span>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">

      {/* Profile Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#1B2D72] text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {profile?.name || user.user_metadata?.name || 'No name set'}
            </h1>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-gray-100">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total Orders</p>
          </div>
          <div className="text-center border-x border-gray-100">
            <p className="text-2xl font-bold text-emerald-600">{totalSpent}K</p>
            <p className="text-xs text-gray-400 mt-0.5">Total Spent</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-500">{pendingDebt}K</p>
            <p className="text-xs text-gray-400 mt-0.5">Pending Debt</p>
          </div>
        </div>
      </div>

      {/* Order History */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Order History</h2>
          {totalOrders > 0 && (
            <span className="text-sm text-gray-400">
              {from + 1}–{Math.min(to + 1, totalOrders)} of {totalOrders}
            </span>
          )}
        </div>

        {!orders || orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No orders yet</p>
            <p className="text-gray-400 text-sm mt-1">Start shopping to see your orders here</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {orders.map((order: Order) => (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                    order.type === 'dept' && order.payment_status !== 'paid'
                      ? 'border-orange-100'
                      : 'border-gray-100'
                  }`}
                >
                  {/* Order Header */}
                  <div className="px-5 py-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-gray-800">
                          #{order.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-gray-400 capitalize bg-gray-50 px-2 py-0.5 rounded-full">
                          {order.type === 'purchase' ? 'Purchase' : 'Debt'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900 mb-1">{order.total_price}K L.L</p>
                      {getStatusBadge(order)}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="border-t border-gray-50 px-5 py-3 bg-gray-50/50">
                    <div className="space-y-1">
                      {order.items?.map((item: OrderItem) => (
                        <div key={item.id} className="flex justify-between text-sm text-gray-600">
                          <span>{item.product_name} × {item.quantity}</span>
                          <span className="font-medium text-gray-800">{item.price * item.quantity}K L.L</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Debt progress bar */}
                  {order.type === 'dept' && order.payment_status === 'partial' && (
                    <div className="px-5 py-3 border-t border-orange-50">
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>Paid: {order.paid_amount ?? 0}K L.L</span>
                        <span>Remaining: {order.total_price - (order.paid_amount ?? 0)}K L.L</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-emerald-500 h-1.5 rounded-full"
                          style={{ width: `${((order.paid_amount ?? 0) / order.total_price) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                {page > 1 ? (
                  <Link
                    href={`/profile?page=${page - 1}`}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous
                  </Link>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Link
                      key={p}
                      href={`/profile?page=${p}`}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                        p === page
                          ? 'bg-[#1B2D72] text-white'
                          : 'text-gray-500 hover:bg-gray-50 border border-gray-200 bg-white'
                      }`}
                    >
                      {p}
                    </Link>
                  ))}
                </div>

                {page < totalPages ? (
                  <Link
                    href={`/profile?page=${page + 1}`}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : (
                  <div />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
