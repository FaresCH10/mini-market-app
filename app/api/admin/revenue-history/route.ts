import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createServiceSupabase } from "@supabase/supabase-js";

type RevenueOrderRow = {
  id: string;
  created_at: string;
  total_price: number;
  paid_amount: number | null;
  payment_status: string | null;
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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const toSafeMoney = (value: unknown): number => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num;
};

const getPaidRatio = (order: RevenueOrderRow): number => {
  const totalPrice = toSafeMoney(order.total_price);
  if (totalPrice <= 0) return 0;

  const paidAmount = toSafeMoney(order.paid_amount);
  let ratio = paidAmount / totalPrice;

  // Keep backward compatibility for old fully paid rows that may not store paid_amount.
  if ((!Number.isFinite(ratio) || ratio <= 0) && order.payment_status === "paid") {
    ratio = 1;
  }

  return clamp01(Number.isFinite(ratio) ? ratio : 0);
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

    const { data: revenueOrders, error: ordersError } = await adminClient
      .from("orders")
      .select("id, created_at, total_price, paid_amount, payment_status")
      .order("created_at", { ascending: false });
    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const orders = (revenueOrders ?? []) as RevenueOrderRow[];
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
    const fullProfitByOrderId = new Map<string, number>();
    for (const item of (items ?? []) as OrderItemRow[]) {
      if (!item.product_id) continue;
      const basePrice = toSafeMoney(productById.get(item.product_id)?.price);
      const sellPrice = toSafeMoney(item.price);
      const quantity = toSafeMoney(item.quantity);
      const itemProfit = Math.max(0, sellPrice - basePrice) * quantity;
      fullProfitByOrderId.set(item.order_id, (fullProfitByOrderId.get(item.order_id) ?? 0) + itemProfit);
    }

    const revenueByDay = new Map<string, number>();
    for (const order of orders) {
      const dayKey = getBusinessDayKey(order.created_at);
      if (!dayKey) continue;
      const fullOrderProfit = fullProfitByOrderId.get(order.id) ?? 0;
      if (fullOrderProfit <= 0) continue;
      const paidRatio = getPaidRatio(order);
      if (paidRatio <= 0) continue;
      const recognizedProfit = fullOrderProfit * paidRatio;
      revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + recognizedProfit);
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
