"use client";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import AddToCartButton from "@/components/AddToCartButton";
import { useCart } from "@/context/CartContext";
import { useEffect, useState } from "react";
import { formatLira } from "@/lib/currency";

type Product = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  sell_price?: number | null;
  image_url?: string | null;
};
const MARKET_LOGO_PLACEHOLDER = "/favicon.ico";

function safeImg(url: string | null | undefined): string {
  if (!url || !url.trim()) return MARKET_LOGO_PLACEHOLDER;
  if (url.startsWith("/")) return url;
  try { new URL(url); return url; } catch { return MARKET_LOGO_PLACEHOLDER; }
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { items, updateQuantity, removeItem } = useCart();
  const supabase = createClient();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  const getCartQuantity = (productId: string) => {
    const cartItem = items.find((item) => item.product_id === productId);
    return cartItem?.quantity || 0;
  };

  const handleDecreaseQuantity = async (product: any) => {
    const currentQuantity = getCartQuantity(product.id);
    if (currentQuantity > 1) {
      await updateQuantity(product.id, currentQuantity - 1);
    } else if (currentQuantity === 1) {
      await removeItem(product.id);
    }
  };

  const handleIncreaseQuantity = async (product: any) => {
    if (product.quantity > getCartQuantity(product.id)) {
      await updateQuantity(product.id, getCartQuantity(product.id) + 1);
    }
  };

  const filtered = products.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-red-500">
          Error loading products. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">
          Welcome to <span className="text-[#1B2D72]">NavyBits Market</span>
        </h1>
        <p className="text-gray-500 text-sm">
          Browse and add products to your cart
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-8 max-w-md">
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
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2D72]/20 focus:border-[#1B2D72] transition-all"
        />
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 animate-pulse"
            >
              <div className="h-48 bg-gray-100" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-5 bg-gray-100 rounded w-1/2" />
                <div className="h-9 bg-gray-100 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Products */}
      {!loading && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No products found</p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-2 text-sm text-[#1B2D72] hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filtered.map((product: any) => {
                const cartQuantity = getCartQuantity(product.id);
                const isInCart = cartQuantity > 0;
                const isOutOfStock = product.quantity <= 0;

                return (
                  <div
                    key={product.id}
                    className="bg-white  overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-200 flex flex-col"
                  >
                    {/* Image */}
                    <div className="relative h-48 bg-gray-50">
                      {safeImg(product.image_url) !== MARKET_LOGO_PLACEHOLDER ? (
                        <Image
                          src={safeImg(product.image_url)}
                          alt={product.name}
                          fill
                          className="object-contain"
                        />
                      ) : (
                        <div className="relative w-full h-full">
                          <Image
                            src={MARKET_LOGO_PLACEHOLDER}
                            alt="Market logo"
                            fill
                            className="object-cover p-8 opacity-90"
                          />
                        </div>
                      )}
                      {/* Stock badge */}
                      {isOutOfStock && (
                        <span className="absolute top-2 right-2 bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                          Out of stock
                        </span>
                      )}
                      {isInCart && !isOutOfStock && (
                        <span className="absolute top-2 right-2 bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                          In cart
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4 flex flex-col flex-1">
                      <h2 className="font-semibold text-gray-900 mb-1 leading-tight">
                        {product.name}
                      </h2>
                      <p className="text-xl font-bold text-[#1B2D72] mb-1">
                        {formatLira(product.sell_price ?? Number((product.price * 1.2).toFixed(2)))}
                      </p>
                      {!isOutOfStock && (
                        <p className="text-xs text-gray-400 mb-3">
                          {product.quantity} in stock
                        </p>
                      )}

                      <div className="mt-auto">
                        {isInCart ? (
                          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1">
                            <button
                              onClick={() => handleDecreaseQuantity(product)}
                              className="w-9 h-9 rounded-lg bg-white shadow-sm text-gray-700 font-bold hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center"
                            >
                              −
                            </button>
                            <span className="text-sm font-bold text-gray-900 w-8 text-center">
                              {cartQuantity}
                            </span>
                            <button
                              onClick={() => handleIncreaseQuantity(product)}
                              disabled={cartQuantity >= product.quantity}
                              className="w-9 h-9 rounded-lg bg-white shadow-sm text-gray-700 font-bold hover:bg-green-50 hover:text-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <AddToCartButton product={product} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
