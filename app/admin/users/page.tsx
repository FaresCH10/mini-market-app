'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

type Profile = { id: string; email: string; name: string; role: string; created_at: string }

export default function ManageUsers() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { checkAdmin() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { toast.error('Access denied.'); router.push('/'); return }
      setIsAdmin(true)
      fetchUsers()
    } catch { router.push('/') }
  }

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setUsers(data || [])
    } catch { toast.error('Failed to load users') }
    finally { setLoading(false) }
  }

  const toggleAdminRole = async (userId: string, currentRole: string) => {
    setUpdatingId(userId)
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
      if (error) throw error
      toast.success(`Role updated to ${newRole}`)
      fetchUsers()
    } catch { toast.error('Failed to update role') }
    finally { setUpdatingId(null) }
  }

  const filtered = users.filter(u =>
    !search.trim() ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  if (!isAdmin) return null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} registered accounts</p>
        </div>
        <button onClick={fetchUsers} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text" placeholder="Search by name or email..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2D72]/20 focus:border-[#1B2D72] transition-all"
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-50 last:border-0 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-gray-100 rounded w-1/4" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
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
                const initials = (user.name || user.email || 'U').slice(0, 2).toUpperCase()
                const isUpdating = updatingId === user.id
                return (
                  <div key={user.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      user.role === 'admin' ? 'bg-[#1B2D72] text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{user.name || 'No name'}</p>
                      <p className="text-xs text-gray-400 truncate">{user.email}</p>
                    </div>

                    {/* Role badge */}
                    <span className={`hidden sm:inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${
                      user.role === 'admin' ? 'bg-[#1B2D72]/10 text-[#1B2D72]' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {user.role || 'user'}
                    </span>

                    {/* Joined */}
                    <p className="hidden lg:block text-xs text-gray-400 w-24 text-right flex-shrink-0">
                      {new Date(user.created_at).toLocaleDateString()}
                    </p>

                    {/* Action */}
                    <button
                      onClick={() => toggleAdminRole(user.id, user.role)}
                      disabled={isUpdating}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-colors disabled:opacity-50 ${
                        user.role === 'admin'
                          ? 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100'
                          : 'bg-[#1B2D72]/5 text-[#1B2D72] border border-[#1B2D72]/10 hover:bg-[#1B2D72]/10'
                      }`}
                    >
                      {isUpdating ? '…' : user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
