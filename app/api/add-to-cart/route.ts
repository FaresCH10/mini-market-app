import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const formData = await request.formData()
  const productId = formData.get('productId')
  
  // Since cart is client-side, we'll just redirect back to home
  // The actual cart logic will be handled by the client-side context
  return NextResponse.redirect(new URL('/', request.url))
}