"use client";
import { useCart } from "@/context/CartContext";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useWallet } from "@/context/WalletContext";
import Image from "next/image";

const MARKET_LOGO_PLACEHOLDER = "/favicon.ico";

export default function CartPage() {
  const { items, removeItem, updateQuantity, total, clearCart, loading } =
    useCart();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const { refreshBalance } = useWallet();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    fetchWalletBalance();
  }, []);

  const fetchWalletBalance = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("wallet_balance")
        .eq("id", user.id)
        .single();
      setWalletBalance(profile?.wallet_balance || 0);
    }
  };

  const handleUpdateQuantity = async (
    productId: string,
    newQuantity: number,
    stock: number,
  ) => {
    if (newQuantity > stock) {
      toast.error(`Only ${stock} in stock`);
      return;
    }
    try {
      await updateQuantity(productId, newQuantity);
    } catch (error) {
      toast.error("Failed to update quantity");
    }
  };

  const handleRemoveItem = async (productId: string, productName: string) => {
    try {
      await removeItem(productId);
      toast.success(`${productName} removed from cart`);
    } catch (error) {
      toast.error("Failed to remove item");
    }
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Please login to checkout");
        router.push("/login");
        return;
      }

      if (items.length === 0) {
        toast.error("Your cart is empty");
        return;
      }

      // Quick client-side stock check before hitting the server
      const overStock = items.filter((item) => item.quantity > item.stock);
      if (overStock.length > 0) {
        toast.error(
          `Not enough stock for: ${overStock.map((i) => `${i.name} (max ${i.stock})`).join(", ")}`,
        );
        return;
      }

      // Verify stock
      for (const item of items) {
        const { data: product, error: fetchError } = await supabase
          .from("products")
          .select("quantity, name")
          .eq("id", item.product_id)
          .single();

        if (fetchError) {
          console.error("Fetch error:", fetchError);
          throw new Error(`Could not verify stock for ${item.name}`);
        }

        if (product.quantity < item.quantity) {
          throw new Error(
            `Not enough stock for ${product.name}. Available: ${product.quantity}`,
          );
        }
      }

      // Determine payment split from current positive wallet funds.
      const availableWallet = Math.max(walletBalance, 0);
      const paidAmount = Math.min(availableWallet, total);
      const debtAmount = total - paidAmount;
      const isFullyPaid = debtAmount === 0;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          total_price: total,
          type: isFullyPaid ? "purchase" : "dept",
          status: isFullyPaid ? "completed" : "pending",
          payment_status: isFullyPaid ? "paid" : paidAmount > 0 ? "partial" : "pending",
          paid_amount: paidAmount,
        })
        .select()
        .single();

      if (orderError) {
        console.error("Order error:", orderError);
        throw orderError;
      }

      // Create order items and update stock
      for (const item of items) {
        const { error: itemError } = await supabase.from("order_items").insert({
          order_id: order.id,
          product_id: item.product_id,
          product_name: item.name,
          quantity: item.quantity,
          price: item.price,
        });

        if (itemError) {
          console.error("Item error:", itemError);
          throw itemError;
        }

        const { data: product } = await supabase
          .from("products")
          .select("quantity")
          .eq("id", item.product_id)
          .single();

        if (!product) {
          console.error("Product not found");
          return;
        }

        const { error: updateError } = await supabase
          .from("products")
          .update({ quantity: product.quantity - item.quantity })
          .eq("id", item.product_id);

        if (updateError) {
          console.error("Update error:", updateError);
          throw updateError;
        }
      }

      // Always deduct full order total from wallet.
      // This allows balance to go negative and represent debt directly.
      const newWalletBalance = walletBalance - total;
      const { error: walletError } = await supabase
        .from("profiles")
        .update({ wallet_balance: newWalletBalance })
        .eq("id", user.id);

      if (walletError) {
        console.error("Wallet error:", walletError);
        throw walletError;
      }
      await refreshBalance();

      await clearCart();

      if (isFullyPaid) {
        toast.success(`Order placed! ${paidAmount}K L.L deducted from wallet.`);
      } else {
        toast.success(
          `Order placed! Wallet used ${paidAmount}K L.L, debt increased by ${debtAmount}K L.L.`,
        );
      }

      // Redirect after successful order
      setTimeout(() => {
        router.push("/profile");
      }, 1500);
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Something went wrong during checkout");
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
          <svg
            className="w-10 h-10 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          Your cart is empty
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          Add some products to get started
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[#000080] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-[#1F51FF] transition-colors"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  const hasEnoughWallet = walletBalance >= total;
  const availableWallet = Math.max(walletBalance, 0);
  const debtAmount = Math.max(0, total - availableWallet);
  const paidFromWallet = Math.min(availableWallet, total);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Shopping Cart
          <span className="ml-2 text-base font-medium text-gray-400">
            ({items.length} items)
          </span>
        </h1>
        <Link
          href="/"
          className="text-sm text-[#000080] hover:underline flex items-center gap-1"
        >
          ← Continue Shopping
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <div
              key={item.product_id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4"
            >
              <div className="w-16 h-16 rounded-xl bg-gray-50 flex-shrink-0 overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center relative">
                    <Image
                      src={MARKET_LOGO_PLACEHOLDER}
                      alt="Market logo"
                      fill
                      className="object-contain p-2 opacity-90"
                    />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">
                  {item.name}
                </h3>
                <p className="text-sm font-bold text-[#000080]">
                  {item.price}K L.L
                </p>
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
                  <button
                    onClick={() =>
                      handleUpdateQuantity(item.product_id, item.quantity - 1, item.stock)
                    }
                    className="w-8 h-8 rounded-lg bg-white shadow-sm text-gray-600 font-bold hover:text-red-500 transition-colors flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-gray-900">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      handleUpdateQuantity(item.product_id, item.quantity + 1, item.stock)
                    }
                    disabled={item.quantity >= item.stock}
                    className="w-8 h-8 rounded-lg bg-white shadow-sm text-gray-600 font-bold hover:text-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                {item.quantity >= item.stock && (
                  <span className="text-[10px] text-orange-500 font-medium">Max stock</span>
                )}
              </div>

              <div className="text-right shrink-0">
                <p className="font-bold text-gray-900">
                  {item.price * item.quantity}K L.L
                </p>
                <button
                  onClick={() => handleRemoveItem(item.product_id, item.name)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors mt-0.5"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-24">
            <h2 className="font-bold text-gray-900 mb-4">Order Summary</h2>

            <div className="space-y-3 text-sm mb-4">
              <div className="flex justify-between text-gray-600">
                <span>
                  Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)
                </span>
                <span className="font-medium text-gray-900">{total}K L.L</span>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                <span className="font-medium text-gray-700">
                  Wallet Balance
                </span>
                <span
                  className={`font-bold ${walletBalance > 0 ? "text-emerald-600" : "text-red-500"}`}
                >
                  {walletBalance}K L.L
                </span>
              </div>

              {!hasEnoughWallet && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between text-emerald-700">
                    <span>Paid from wallet</span>
                    <span className="font-semibold">{paidFromWallet}K L.L</span>
                  </div>
                  <div className="flex justify-between text-orange-600">
                    <span>Remaining as debt</span>
                    <span className="font-semibold">{debtAmount}K L.L</span>
                  </div>
                </div>
              )}

              {walletBalance <= 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-600 text-xs">
                  Your wallet is in debt. New orders will increase debt automatically.
                </div>
              )}

              <div className="flex justify-between font-bold text-base border-t border-gray-100 pt-3">
                <span>Total</span>
                <span>{total}K L.L</span>
              </div>
            </div>

            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                checkoutLoading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : !hasEnoughWallet
                    ? "bg-orange-500 hover:bg-orange-600 text-white active:scale-95"
                    : "bg-[#000080] hover:bg-[#1F51FF] text-white active:scale-95"
              }`}
            >
              {checkoutLoading
                ? "Processing..."
                : hasEnoughWallet
                  ? `Pay ${total}K L.L from Wallet`
                  : `Pay ${paidFromWallet}K L.L + ${debtAmount}K L.L Debt`}
            </button>

            <p className="text-xs text-gray-400 text-center mt-3 leading-relaxed">
              {hasEnoughWallet
                ? `${total}K L.L deducted from wallet.`
                : `Wallet covers ${paidFromWallet}K L.L, ${debtAmount}K L.L added to debt.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
