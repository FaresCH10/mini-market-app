'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type CartItem = {
  id: string
  product_id: string
  name: string
  price: number
  quantity: number
  image_url?: string
}

type CartContextType = {
  items: CartItem[]
  addItem: (product: any) => Promise<void>
  removeItem: (productId: string) => Promise<void>
  updateQuantity: (productId: string, quantity: number) => Promise<void>
  clearCart: () => Promise<void>
  total: number
  itemCount: number
  loading: boolean
  refreshCart: () => Promise<void>
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id || null)
    }
    getUser()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id || null)
      if (!session?.user) {
        setItems([])
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  // Fetch cart from database when user changes
  useEffect(() => {
    if (userId) {
      fetchCart()
    } else {
      setItems([])
      setLoading(false)
    }
  }, [userId])

  const fetchCart = async () => {
    if (!userId) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('carts')
        .select(`
          id,
          product_id,
          quantity,
          products (
            name,
            price,
            image_url
          )
        `)
        .eq('user_id', userId)

      if (error) {
        console.error('Fetch cart error:', error)
        throw error
      }

      const formattedItems: CartItem[] = data.map(item => ({
        id: item.id,
        product_id: item.product_id,
        name: item.products.name,
        price: item.products.price,
        quantity: item.quantity,
        image_url: item.products.image_url
      }))

      setItems(formattedItems)
    } catch (error) {
      console.error('Error fetching cart:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshCart = async () => {
    await fetchCart()
  }

  const addItem = async (product: any) => {
    if (!userId) {
      toast.error('Please login first')
      router.push('/login')
      return
    }

    try {
      const existingItem = items.find(i => i.product_id === product.id)
      
      if (existingItem) {
        // Update quantity if item exists
        const newQuantity = existingItem.quantity + 1
        const { error } = await supabase
          .from('carts')
          .update({ quantity: newQuantity })
          .eq('user_id', userId)
          .eq('product_id', product.id)
        
        if (error) throw error
      } else {
        // Insert new item
        const { error } = await supabase
          .from('carts')
          .insert({
            user_id: userId,
            product_id: product.id,
            quantity: 1
          })
        
        if (error) throw error
      }
      
      await fetchCart() // Refresh cart
    } catch (error) {
      console.error('Error adding to cart:', error)
      throw error
    }
  }

  const removeItem = async (productId: string) => {
    if (!userId) return

    try {
      const { error } = await supabase
        .from('carts')
        .delete()
        .eq('user_id', userId)
        .eq('product_id', productId)
      
      if (error) throw error
      
      await fetchCart() // Refresh cart
    } catch (error) {
      console.error('Error removing item:', error)
      throw error
    }
  }

  const updateQuantity = async (productId: string, quantity: number) => {
    if (!userId) return

    if (quantity <= 0) {
      await removeItem(productId)
      return
    }

    try {
      const { error } = await supabase
        .from('carts')
        .update({ quantity })
        .eq('user_id', userId)
        .eq('product_id', productId)
      
      if (error) throw error
      
      await fetchCart() // Refresh cart
    } catch (error) {
      console.error('Error updating quantity:', error)
      throw error
    }
  }

  const clearCart = async () => {
    if (!userId) return

    try {
      const { error } = await supabase
        .from('carts')
        .delete()
        .eq('user_id', userId)
      
      if (error) throw error
      
      setItems([])
    } catch (error) {
      console.error('Error clearing cart:', error)
      throw error
    }
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      total,
      itemCount,
      loading,
      refreshCart
    }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within CartProvider')
  }
  return context
}