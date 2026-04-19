"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";

const ALLOWED_PATHS = ["/pending-approval", "/auth/login", "/auth/sign-up", "/auth/forgot-password", "/auth/update-password", "/auth/confirm"];

export default function ApprovalGuard() {
  const { userId, authChecked, isApproved } = useCart();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!authChecked) return;
    if (!userId) return; // not logged in — other guards handle this
    if (isApproved !== false) return; // null (loading) or true — let them through

    const isAllowed = ALLOWED_PATHS.some((p) => pathname.startsWith(p));
    if (!isAllowed) {
      router.replace("/pending-approval");
    }
  }, [authChecked, userId, isApproved, pathname, router]);

  return null;
}
