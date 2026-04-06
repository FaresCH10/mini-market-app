"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import AuthButton from "@/components/auth-button";
import { FaShoppingBag, FaTimes } from "react-icons/fa";
import { AiOutlineShoppingCart } from "react-icons/ai";
import { IoWalletOutline } from "react-icons/io5";
import WalletModal from "@/components/WalletModal";
import { useCart } from "@/context/CartContext";
import { useWallet } from "@/context/WalletContext";

export default function Navbar() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const { itemCount } = useCart();
  const { balance, refreshBalance } = useWallet();
  const supabase = createClient();

  useEffect(() => {
    const checkAdminStatus = async (userId: string) => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();
        setIsAdmin(profile?.role === "admin");
      } catch (error) {
        console.error("Error checking admin status:", error);
      }
    };

    const handleUser = async (user: { id: string; email?: string } | null) => {
      setLogged(!!user);
      setUserEmail(user?.email ?? null);
      setIsAdmin(false);
      if (user) {
        await refreshBalance();
        await checkAdminStatus(user.id);
      }
      setLoadingAuth(false);
    };

    // Initial load
    supabase.auth.getUser().then(({ data: { user } }) => {
      handleUser(user);
    });

    // React to login / logout without requiring a refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingAuth) {
    return (
      <nav className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#000080] font-bold text-xl">
            <div className="bg-[#000080] text-white p-1.5 rounded-lg">
              <FaShoppingBag size={16} />
            </div>
            <span className="hidden sm:inline">NavyBits Market</span>
          </div>
          <div className="w-24 h-8 bg-gray-100 animate-pulse rounded-full" />
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-2 text-[#000080] font-bold text-xl tracking-tight hover:opacity-80 transition-opacity"
            >
              <div className="bg-[#000080] text-white p-1.5 rounded-lg">
                <FaShoppingBag size={16} />
              </div>
              <span className="hidden sm:inline">NavyBits Market</span>
              <span className="sm:hidden">NavyBits</span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-[#000080] hover:bg-blue-50 transition-all"
              >
                Products
              </Link>
              <Link
                href="/cart"
                className="relative px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-[#000080] hover:bg-blue-50 transition-all flex items-center gap-1.5"
              >
                <AiOutlineShoppingCart size={18} />
                Cart
                {itemCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-[#000080] hover:bg-blue-50 transition-all"
                >
                  Dashboard
                </Link>
              )}
            </div>

            {/* Desktop Right */}
            <div className="hidden md:flex items-center gap-3">
              {logged && (
                <button
                  onClick={() => setShowWalletModal(true)}
                  className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-emerald-100 transition-all"
                >
                  <IoWalletOutline size={15} />
                  {balance.toLocaleString()} K L.L
                </button>
              )}
              <AuthButton />
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden relative w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              <span className={`block w-5 h-0.5 bg-gray-700 rounded-full transition-all duration-300 ${isMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block w-5 h-0.5 bg-gray-700 rounded-full transition-all duration-300 ${isMenuOpen ? "opacity-0 scale-x-0" : ""}`} />
              <span className={`block w-5 h-0.5 bg-gray-700 rounded-full transition-all duration-300 ${isMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsMenuOpen(false)}
      />

      {/* Mobile Drawer */}
      <div
        className={`md:hidden fixed top-0 right-0 z-50 h-full w-72 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100">
          <div className="flex items-center gap-2 text-[#000080] font-bold">
            <div className="bg-[#000080] text-white p-1.5 rounded-lg">
              <FaShoppingBag size={13} />
            </div>
            NavyBits
          </div>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <FaTimes size={16} />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          <Link
            href="/"
            onClick={() => setIsMenuOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[#000080] transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Products
          </Link>

          <Link
            href="/cart"
            onClick={() => setIsMenuOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[#000080] transition-colors"
          >
            <AiOutlineShoppingCart size={17} className="text-gray-400" />
            Cart
            {itemCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                {itemCount}
              </span>
            )}
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[#000080] transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Dashboard
            </Link>
          )}
        </nav>

        {/* Bottom Section */}
        <div className="px-4 py-4 border-t border-gray-100 space-y-2">
          {logged ? (
            <>
              {/* User info */}
              <div className="flex items-center gap-3 px-4 py-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-[#000080] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {userEmail ? userEmail[0].toUpperCase() : "?"}
                </div>
                <span className="text-sm text-gray-600 truncate">{userEmail}</span>
              </div>

              {/* Wallet */}
              <button
                onClick={() => { setShowWalletModal(true); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <IoWalletOutline size={18} />
                <span>{balance.toLocaleString()} K L.L</span>
                <span className="ml-auto text-xs text-emerald-500 font-medium">Wallet</span>
              </button>

              {/* Profile */}
              <Link
                href="/profile"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[#000080] transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile
              </Link>

              {/* Sign out */}
              <button
                onClick={async () => {
                  setIsMenuOpen(false);
                  await supabase.auth.signOut();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-[#000080] hover:bg-[#1F51FF] transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onBalanceUpdate={() => { refreshBalance(); }}
      />
    </>
  );
}
