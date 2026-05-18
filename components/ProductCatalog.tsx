"use client";
import Image from "next/image";
import AddToCartButton from "@/components/AddToCartButton";
import { useCart } from "@/context/CartContext";
import { useEffect, useState } from "react";
import { formatLira, formatDollar } from "@/lib/currency";

export type Product = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  sell_price?: number | null;
  image_url?: string | null;
};
const MARKET_LOGO_PLACEHOLDER = "/favicon.ico";
const MOBILE_COLUMNS_STORAGE_KEY = "mm_products_mobile_columns";
const DEFAULT_EXCHANGE_RATE = 90_000;

function safeImg(url: string | null | undefined): string {
  if (!url || !url.trim()) return MARKET_LOGO_PLACEHOLDER;
  if (url.startsWith("/")) return url;
  try { new URL(url); return url; } catch { return MARKET_LOGO_PLACEHOLDER; }
}

export default function ProductCatalog({
  initialProducts,
  error,
}: {
  initialProducts: Product[];
  error?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [mobileColumns, setMobileColumns] = useState<1 | 2>(1);
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE);
  const { items, updateQuantity, removeItem } = useCart();

  useEffect(() => {
    const saved = localStorage.getItem(MOBILE_COLUMNS_STORAGE_KEY);
    setMobileColumns(saved === "2" ? 2 : 1);
    setExchangeRate(Number(localStorage.getItem("mm_exchange_rate")) || DEFAULT_EXCHANGE_RATE);
  }, []);

  const toggleMobileColumns = () => {
    setMobileColumns((prev) => {
      const next = prev === 1 ? 2 : 1;
      localStorage.setItem(MOBILE_COLUMNS_STORAGE_KEY, String(next));
      return next;
    });
  };

  const getCartQuantity = (productId: string) => {
    const cartItem = items.find((item) => item.product_id === productId);
    return cartItem?.quantity || 0;
  };

  const handleDecreaseQuantity = async (product: Product) => {
    const currentQuantity = getCartQuantity(product.id);
    if (currentQuantity > 1) {
      await updateQuantity(product.id, currentQuantity - 1);
    } else if (currentQuantity === 1) {
      await removeItem(product.id);
    }
  };

  const handleIncreaseQuantity = async (product: Product) => {
    if (product.quantity > getCartQuantity(product.id)) {
      await updateQuantity(product.id, getCartQuantity(product.id) + 1);
    }
  };

  const filtered = initialProducts.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const mobileGridClass = mobileColumns === 2 ? "grid-cols-2" : "grid-cols-1";

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
      <div className="mb-8 max-w-md">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
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
          <button
            type="button"
            onClick={toggleMobileColumns}
            aria-pressed={mobileColumns === 2}
            className="sm:hidden shrink-0 h-10 px-2.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            aria-label={`Toggle mobile layout (currently ${mobileColumns} column${mobileColumns === 1 ? "" : "s"})`}
          >
            <span className="text-[11px] text-gray-500">1</span>
            <span className={`relative w-8 h-4 rounded-full transition-colors ${mobileColumns === 2 ? "bg-[#1B2D72]" : "bg-gray-300"}`}>
              <span
                className={`absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${mobileColumns === 2 ? "translate-x-4" : "translate-x-0"}`}
              />
            </span>
            <span className="text-[11px] text-gray-500">2</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {/* Products */}
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
            <div className={`grid ${mobileGridClass} sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6`}>
              {filtered.map((product, index) => {
                const cartQuantity = getCartQuantity(product.id);
                const isInCart = cartQuantity > 0;
                const isOutOfStock = product.quantity <= 0;
                const isPriorityImage = index === 0;

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
                          priority={isPriorityImage}
                          sizes={mobileColumns === 2 ? "(max-width: 640px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" : "(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"}
                          className="object-contain"
                        />
                      ) : (
                        <div className="relative w-full h-full">
                          <Image
                            src={MARKET_LOGO_PLACEHOLDER}
                            alt="Market logo"
                            fill
                            priority={isPriorityImage}
                            sizes={mobileColumns === 2 ? "(max-width: 640px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" : "(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"}
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
                      <p className="text-xl font-bold text-[#1B2D72] mb-0.5">
                        {formatLira(product.sell_price ?? Number((product.price * 1.2).toFixed(2)))}
                      </p>
                      <p className="text-sm text-gray-400 mb-1">
                        {formatDollar(product.sell_price ?? Number((product.price * 1.2).toFixed(2)), exchangeRate)}
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
    </div>
  );
}
