// 'use client'
// import { useEffect, useState } from 'react'
// import { createClient } from '@/lib/supabase/client'
// import { useRouter } from 'next/navigation'
// import toast from 'react-hot-toast'

// export default function WalletPage() {
//   const [balance, setBalance] = useState(0)
//   const [addAmount, setAddAmount] = useState('')
//   const [loading, setLoading] = useState(false)
//   const [refreshing, setRefreshing] = useState(false)
//   const router = useRouter()
//   const supabase = createClient()

//   useEffect(() => {
//     fetchBalance()
//   }, [])

//   const fetchBalance = async () => {
//     setRefreshing(true)
//     try {
//       const { data: { user } } = await supabase.auth.getUser()
//       if (!user) {
//         router.push('/login')
//         return
//       }

//       const { data: profile, error } = await supabase
//         .from('profiles')
//         .select('wallet_balance')
//         .eq('id', user.id)
//         .single()

//       if (error) {
//         console.error('Fetch error:', error)
//         toast.error('Failed to fetch balance')
//         return
//       }

//       console.log('Fetched balance:', profile?.wallet_balance)
//       setBalance(profile?.wallet_balance || 0)
//     } catch (error) {
//       console.error('Error fetching balance:', error)
//       toast.error('Failed to fetch balance')
//     } finally {
//       setRefreshing(false)
//     }
//   }

//   const addMoney = async () => {
//     const amount = parseFloat(addAmount)
//     if (!amount || amount <= 0) {
//       toast.error('Please enter a valid amount')
//       return
//     }

//     setLoading(true)
//     try {
//       const { data: { user } } = await supabase.auth.getUser()
//       if (!user) throw new Error('Not logged in')

//       // Get current balance
//       const { data: profile, error: fetchError } = await supabase
//         .from('profiles')
//         .select('wallet_balance')
//         .eq('id', user.id)
//         .single()

//       if (fetchError) throw fetchError

//       const currentBalance = profile?.wallet_balance || 0
//       const newBalance = currentBalance + amount

//       // Auto-pay pending debt orders (oldest first) when user recharges.
//       let remainingTopUp = amount
//       const { data: debtOrders, error: debtFetchError } = await supabase
//         .from('orders')
//         .select('id, total_price, paid_amount')
//         .eq('user_id', user.id)
//         .eq('type', 'dept')
//         .neq('payment_status', 'paid')
//         .order('created_at', { ascending: true })

//       if (debtFetchError) throw debtFetchError

//       for (const order of debtOrders ?? []) {
//         if (remainingTopUp <= 0) break
//         const paid = order.paid_amount || 0
//         const remainingDebt = Math.max(0, order.total_price - paid)
//         if (remainingDebt <= 0) continue

//         const payment = Math.min(remainingTopUp, remainingDebt)
//         const updatedPaid = paid + payment
//         const isPaid = updatedPaid >= order.total_price

//         const { error: debtUpdateError } = await supabase
//           .from('orders')
//           .update({
//             paid_amount: updatedPaid,
//             payment_status: isPaid ? 'paid' : 'partial',
//             status: isPaid ? 'completed' : 'pending',
//           })
//           .eq('id', order.id)

//         if (debtUpdateError) throw debtUpdateError
//         remainingTopUp -= payment
//       }

//       console.log('Current:', currentBalance, 'Adding:', amount, 'New:', newBalance)

//       // Update balance
//       const { error: updateError } = await supabase
//         .from('profiles')
//         .update({ wallet_balance: newBalance })
//         .eq('id', user.id)

//       if (updateError) throw updateError

//       // Update local state
//       setBalance(newBalance)
//       setAddAmount('')
      
//       toast.success(`$${amount.toFixed(2)} added to wallet!`)
//       toast.success(`New balance: $${newBalance.toFixed(2)}`)
      
//       // Force refresh to verify
//       await fetchBalance()
      
//     } catch (error) {
//       console.error('Error adding money:', error)
//       toast.error('Failed to add money')
//     } finally {
//       setLoading(false)
//     }
//   }

//   return (
//     <div className="container mx-auto p-4 max-w-md">
//       <h1 className="text-2xl font-bold mb-6">My Wallet</h1>

//       <div className="bg-white rounded-lg shadow p-6 mb-6">
//         <p className="text-gray-600 mb-2">Current Balance</p>
//         <p className="text-4xl font-bold text-green-600">
//           {refreshing ? '...' : `$${balance.toFixed(2)}`}
//         </p>
//         <button
//           onClick={fetchBalance}
//           className="mt-2 text-sm text-blue-600 hover:text-blue-800"
//         >
//           Refresh Balance
//         </button>
//       </div>

//       <div className="bg-white rounded-lg shadow p-6">
//         <h2 className="text-lg font-semibold mb-4">Add Money</h2>
//         <input
//           type="number"
//           step="0.01"
//           min="0.01"
//           placeholder="Enter amount"
//           value={addAmount}
//           onChange={(e) => setAddAmount(e.target.value)}
//           className="w-full border rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
//         />
//         <button
//           onClick={addMoney}
//           disabled={loading}
//           className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
//         >
//           {loading ? 'Adding...' : 'Add Money'}
//         </button>
//       </div>

//       {/* Quick Add Buttons */}
//       <div className="mt-4 grid grid-cols-3 gap-2">
//         {[10, 20, 50].map((amount) => (
//           <button
//             key={amount}
//             onClick={() => setAddAmount(amount.toString())}
//             className="py-2 border rounded-lg hover:bg-gray-50 transition-colors"
//           >
//             +${amount}
//           </button>
//         ))}
//       </div>
//     </div>
//   )
// }