'use client'
import { useState } from 'react'
import { useCart } from '@/context/CartContext'
import toast from 'react-hot-toast'

type Product = {
  id: string
  name: string
  price: number
  quantity: number
  image_url?: string
}

export default function AddToCartButton({ product }: { product: Product }) {
  const { addItem, userId } = useCart()
  const [isLoading, setIsLoading] = useState(false)

  const handleAddToCart = async () => {
    if (product.quantity <= 0) {
      toast.error('Out of stock!')
      return
    }
    setIsLoading(true)
    try {
      await addItem(product)
      if (userId) toast.success(`${product.name} added to cart!`)
    } catch (error) {
      toast.error('Failed to add to cart')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  if (product.quantity <= 0) {
    return (
      <button
        disabled
        className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400 cursor-not-allowed"
      >
        Out of Stock
      </button>
    )
  }

  return (
    <button
      onClick={handleAddToCart}
      disabled={isLoading}
      className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[#1B2D72] text-white hover:bg-[#00AECC] active:scale-95 disabled:opacity-60 transition-all duration-150 flex items-center justify-center gap-2"
    >
      {isLoading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Adding...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Add to Cart
        </>
      )}
    </button>
  )
}
