import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createServiceSupabase } from "@supabase/supabase-js";

type PaidOrderRow = {
  id: string;
  created_at: string;
};

type OrderItemRow = {
  order_id: string;
  product_id: string | null;
  quantity: number;
  price: number;
};

type ProductRow = {
  id: string;
  price: number;
};

const BEIRUT_TIME_ZONE = "Asia/Beirut";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

const getZonedParts = (date: Date, timeZone: string): ZonedParts => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
  };
};

const toDayKey = (parts: ZonedParts): string =>
  `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

const getBusinessDayKey = (createdAt: string): string | null => {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return null;

  const parts = getZonedParts(new Date(createdMs), BEIRUT_TIME_ZONE);
  if (parts.hour >= 1) return toDayKey(parts);

  // Before 1:00 AM belongs to the previous business day.
  const previousDayParts = getZonedParts(
    new Date(createdMs - 24 * 60 * 60 * 1000),
    BEIRUT_TIME_ZONE,
  );
  return toDayKey(previousDayParts);
};

export async function GET() {
  try {
    const authClient = await createServerSupabase();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
    }
    const adminClient = createServiceSupabase(supabaseUrl, serviceRoleKey);

    const { data: paidOrders, error: ordersError } = await adminClient
      .from("orders")
      .select("id, created_at")
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false });
    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const orders = (paidOrders ?? []) as PaidOrderRow[];
    if (orders.length === 0) {
      return NextResponse.json({ history: [] });
    }

    const orderIds = orders.map((o) => o.id);
    const { data: items, error: itemsError } = await adminClient
      .from("order_items")
      .select("order_id, product_id, quantity, price")
      .in("order_id", orderIds);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const productIds = [
      ...new Set(
        ((items ?? []) as OrderItemRow[])
          .map((item) => item.product_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: productRows, error: productsError } = productIds.length
      ? await adminClient.from("products").select("id, price").in("id", productIds)
      : { data: [] as ProductRow[], error: null };
    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    const productById = new Map((productRows ?? []).map((p) => [p.id, p]));
    const revenueByOrderId = new Map<string, number>();
    for (const item of (items ?? []) as OrderItemRow[]) {
      if (!item.product_id) continue;
      const basePrice = Number(productById.get(item.product_id)?.price ?? 0);
      const sellPrice = Number(item.price ?? 0);
      const quantity = Number(item.quantity ?? 0);
      const itemRevenue = Math.max(0, sellPrice - basePrice) * quantity;
      revenueByOrderId.set(item.order_id, (revenueByOrderId.get(item.order_id) ?? 0) + itemRevenue);
    }

    const revenueByDay = new Map<string, number>();
    for (const order of orders) {
      const dayKey = getBusinessDayKey(order.created_at);
      if (!dayKey) continue;
      const revenue = revenueByOrderId.get(order.id) ?? 0;
      revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + revenue);
    }

    const history = [...revenueByDay.entries()]
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
