"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

export default function ChatWidgetLoader() {
  const [showChat, setShowChat] = useState(false);
  const { itemCount } = useCart();
  const router = useRouter();

  useEffect(() => {
    const openChat = () => setShowChat(true);
    window.addEventListener("open-chat-widget", openChat);
    return () => window.removeEventListener("open-chat-widget", openChat);
  }, []);

  useEffect(() => {
    router.prefetch("/cart");
    router.prefetch("/debt");
    router.prefetch("/profile");
  }, [router]);

  return (
    <>
      <Link
        href="/cart"
        aria-label="Go to cart"
        className="fixed bottom-6 right-6 z-[9998] flex h-14 w-14 items-center justify-center rounded-full border-0 bg-[#1B2D72] text-white shadow-[0_4px_24px_rgba(27,45,114,0.38)] transition-transform hover:scale-105"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.7L23 6H6" />
        </svg>
        {itemCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {itemCount > 9 ? "9+" : itemCount}
          </span>
        )}
      </Link>
      {showChat && <ChatWidget fabMode="chat" initialOpen hideFloatingFab />}
    </>
  );
}
