"use client";
import { useCart } from "@/context/CartContext";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Image from "next/image";
import { formatLira, kToLira, liraToK } from "@/lib/currency";

const MARKET_LOGO_PLACEHOLDER = "/favicon.ico";

function safeImg(url: string | null | undefined): string {
  if (!url || !url.trim()) return MARKET_LOGO_PLACEHOLDER;
  if (url.startsWith("/")) return url;
  try { new URL(url); return url; } catch { return MARKET_LOGO_PLACEHOLDER; }
}

export default function CartPage() {
  const { items, removeItem, updateQuantity, total, clearCart, loading } = useCart();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [payNow, setPayNow] = useState<string>("");
  const router = useRouter();
  const supabase = createClient();

  // Keep payNow in sync when total changes (e.g. items added/removed)
  useEffect(() => {
    setPayNow(String(kToLira(total)));
  }, [total]);

  const payNowNum = Math.max(0, Math.min(liraToK(parseFloat(payNow) || 0), total));
  const debtAmount = total - payNowNum;
  const isFullPayment = debtAmount === 0;
  const isFullDebt = payNowNum === 0;

  const handleUpdateQuantity = async (productId: string, newQuantity: number, stock: number) => {
    if (newQuantity > stock) {
      toast.error(`Only ${stock} in stock`);
      return;
    }
    try {
      await updateQuantity(productId, newQuantity);
    } catch {
      toast.error("Failed to update quantity");
    }
  };

  const handleRemoveItem = async (productId: string, productName: string) => {
    try {
      await removeItem(productId);
      toast.success(`${productName} removed from cart`);
    } catch {
      toast.error("Failed to remove item");
    }
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Please login to checkout"); router.push('/auth/login'); return; }
      if (items.length === 0) { toast.error("Your cart is empty"); return; }

      // Validate pay now amount
      if (isNaN(parseFloat(payNow)) || parseFloat(payNow) < 0) {
        toast.error("Enter a valid amount to pay now");
        return;
      }
      if (payNowNum > total) {
        toast.error("Pay now amount cannot exceed the total");
        return;
      }

      // Client-side stock check
      const overStock = items.filter((item) => item.quantity > item.stock);
      if (overStock.length > 0) {
        toast.error(`Not enough stock for: ${overStock.map((i) => `${i.name} (max ${i.stock})`).join(", ")}`);
        return;
      }

      // Server-side stock verification
      for (const item of items) {
        const { data: product, error: fetchError } = await supabase
          .from("products").select("quantity, name").eq("id", item.product_id).single();
        if (fetchError) throw new Error(`Could not verify stock for ${item.name}`);
        if (product.quantity < item.quantity)
          throw new Error(`Not enough stock for ${product.name}. Available: ${product.quantity}`);
      }

      // Determine order type based on split
      const orderType = isFullPayment ? "purchase" : "dept";
      const paymentStatus = isFullPayment ? "paid" : payNowNum > 0 ? "partial" : "pending";
      const orderStatus = isFullPayment ? "completed" : "pending";

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          total_price: total,
          type: orderType,
          status: orderStatus,
          payment_status: paymentStatus,
          paid_amount: payNowNum,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      // Insert order items and deduct stock
      for (const item of items) {
        const { error: itemError } = await supabase.from("order_items").insert({
          order_id: order.id,
          product_id: item.product_id,
          product_name: item.name,
          quantity: item.quantity,
          price: item.price,
        });
        if (itemError) throw itemError;

        const { data: product } = await supabase
          .from("products").select("quantity").eq("id", item.product_id).single();
        if (!product) throw new Error("Product not found");

        const { error: updateError } = await supabase
          .from("products").update({ quantity: product.quantity - item.quantity }).eq("id", item.product_id);
        if (updateError) throw updateError;
      }

      await clearCart();

      if (isFullPayment) {
        toast.success("Order placed successfully!");
      } else if (isFullDebt) {
        toast.success("Order recorded as debt!");
      } else {
        toast.success(`Paid ${formatLira(payNowNum)} now — ${formatLira(debtAmount)} recorded as debt`);
      }

      setTimeout(() => router.push("/profile"), 1500);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Something went wrong during checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-400">Loading cart...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Your cart is empty</h2>
        <p className="text-gray-400 text-sm mb-6">Add some products to get started</p>
        <Link href="/" className="inline-flex items-center gap-2 bg-[#1B2D72] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-[#00AECC] transition-colors">
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Shopping Cart
          <span className="ml-2 text-base font-medium text-gray-400">({items.length} items)</span>
        </h1>
        <Link href="/" className="text-sm text-[#1B2D72] hover:underline flex items-center gap-1">
          ← Continue Shopping
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <div key={item.product_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-xl bg-gray-50 flex-shrink-0 overflow-hidden">
                <Image
                  src={safeImg(item.image_url)}
                  alt={item.name}
                  fill
                  className={safeImg(item.image_url) !== MARKET_LOGO_PLACEHOLDER ? "object-cover" : "object-contain p-2 opacity-90"}
                />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                <p className="text-sm font-bold text-[#1B2D72]">{formatLira(item.price)}</p>
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
                  <button
                    onClick={() => handleUpdateQuantity(item.product_id, item.quantity - 1, item.stock)}
                    className="w-8 h-8 rounded-lg bg-white shadow-sm text-gray-600 font-bold hover:text-red-500 transition-colors flex items-center justify-center"
                  >−</button>
                  <span className="w-8 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                  <button
                    onClick={() => handleUpdateQuantity(item.product_id, item.quantity + 1, item.stock)}
                    disabled={item.quantity >= item.stock}
                    className="w-8 h-8 rounded-lg bg-white shadow-sm text-gray-600 font-bold hover:text-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >+</button>
                </div>
                {item.quantity >= item.stock && (
                  <span className="text-[10px] text-orange-500 font-medium">Max stock</span>
                )}
              </div>

              <div className="text-right shrink-0">
                <p className="font-bold text-gray-900">{formatLira(item.price * item.quantity)}</p>
                <button
                  onClick={() => handleRemoveItem(item.product_id, item.name)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors mt-0.5"
                >Remove</button>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-24">
            <h2 className="font-bold text-gray-900 mb-4">Order Summary</h2>

            {/* Totals */}
            <div className="space-y-2 text-sm mb-5">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span className="font-medium text-gray-900">{formatLira(total)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-gray-100 pt-3">
                <span>Total</span>
                <span>{formatLira(total)}</span>
              </div>
            </div>

            {/* Payment split */}
            <div className="mb-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</p>

              {/* Pay now input */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Pay now</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={kToLira(total)}
                    value={payNow}
                    onChange={(e) => setPayNow(e.target.value)}
                    onBlur={() => {
                      // Clamp on blur
                      const v = parseFloat(payNow) || 0;
                      setPayNow(String(Math.max(0, Math.min(v, kToLira(total)))));
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B2D72]/30 focus:border-[#1B2D72] pr-14"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">L.L</span>
                </div>
                {/* Quick-fill buttons */}
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    onClick={() => setPayNow("0")}
                    className="flex-1 text-xs py-1 rounded-lg bg-gray-50 text-gray-500 hover:bg-orange-50 hover:text-orange-600 transition-colors font-medium"
                  >All debt</button>
                  <button
                    onClick={() => setPayNow(String(Math.round(kToLira(total / 2))))}
                    className="flex-1 text-xs py-1 rounded-lg bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-[#1B2D72] transition-colors font-medium"
                  >Half</button>
                  <button
                    onClick={() => setPayNow(String(kToLira(total)))}
                    className="flex-1 text-xs py-1 rounded-lg bg-gray-50 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors font-medium"
                  >Full</button>
                </div>
              </div>

              {/* Debt remainder */}
              <div className={`rounded-xl px-3 py-2.5 flex justify-between items-center text-sm ${
                debtAmount > 0 ? "bg-orange-50 border border-orange-100" : "bg-emerald-50 border border-emerald-100"
              }`}>
                <span className={`font-medium ${debtAmount > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                  {debtAmount > 0 ? "Goes to debt" : "No debt"}
                </span>
                <span className={`font-bold ${debtAmount > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                  {formatLira(debtAmount)}
                </span>
              </div>
            </div>

            {/* Checkout button */}
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                checkoutLoading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : debtAmount > 0
                    ? "bg-orange-500 hover:bg-orange-600 text-white active:scale-95"
                    : "bg-[#1B2D72] hover:bg-[#00AECC] text-white active:scale-95"
              }`}
            >
              {checkoutLoading
                ? "Processing..."
                : isFullPayment
                  ? `Purchase — ${formatLira(total)}`
                  : isFullDebt
                    ? `Record as Debt — ${formatLira(total)}`
                    : `Pay ${formatLira(payNowNum)} now + ${formatLira(debtAmount)} debt`}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
