import { NextRequest, NextResponse } from "next/server";
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
  minute: number;
  second: number;
};

const getZonedParts = (date: Date, timeZone: string): ZonedParts => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
};

const getTimeZoneOffsetMs = (date: Date, timeZone: string): number => {
  const zoned = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  return asUtc - date.getTime();
};

const zonedTimeToUtcMs = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number => {
  const utcBase = Date.UTC(year, month - 1, day, hour, minute, second);
  let result = utcBase;
  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(result), timeZone);
    result = utcBase - offset;
  }
  return result;
};

const getBusinessDayStartMs = (now: Date): number => {
  const beirutNow = getZonedParts(now, BEIRUT_TIME_ZONE);
  const reference =
    beirutNow.hour < 1 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  const ref = getZonedParts(reference, BEIRUT_TIME_ZONE);
  return zonedTimeToUtcMs(
    ref.year,
    ref.month,
    ref.day,
    1,
    0,
    0,
    BEIRUT_TIME_ZONE,
  );
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

export async function GET(req: NextRequest) {
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

    const range = req.nextUrl.searchParams.get("range") ?? "day";
    const includeAllTime = range === "all";

    const now = new Date();
    const nowMs = now.getTime();
    const businessDayStartMs = getBusinessDayStartMs(now);
    const windowStartIso = new Date(businessDayStartMs).toISOString();
    const nowIso = now.toISOString();

    let revenueOrdersQuery = adminClient
      .from("orders")
      .select("id, created_at, total_price, paid_amount, payment_status")
      .order("created_at", { ascending: false });

    if (!includeAllTime) {
      revenueOrdersQuery = revenueOrdersQuery
        .gte("created_at", windowStartIso)
        .lte("created_at", nowIso);
    }

    const { data: revenueOrders, error: revenueOrdersError } = await revenueOrdersQuery;

    if (revenueOrdersError) {
      return NextResponse.json({ error: revenueOrdersError.message }, { status: 500 });
    }

    const ordersInWindow = includeAllTime
      ? ((revenueOrders ?? []) as RevenueOrderRow[])
      : ((revenueOrders ?? []) as RevenueOrderRow[]).filter((order) => {
          const createdAtMs = new Date(order.created_at).getTime();
          return Number.isFinite(createdAtMs) && createdAtMs >= businessDayStartMs && createdAtMs <= nowMs;
        });
    const orderIds = ordersInWindow.map((order) => order.id);

    if (orderIds.length === 0) {
      return NextResponse.json({ revenue: 0, orderCount: 0, windowStartIso });
    }

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
          .filter((productId): productId is string => Boolean(productId)),
      ),
    ];

    const { data: productRows, error: productsError } = productIds.length
      ? await adminClient
          .from("products")
          .select("id, price")
          .in("id", productIds)
      : { data: [] as ProductRow[], error: null };

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    const productById = new Map((productRows ?? []).map((product) => [product.id, product]));
    const fullProfitByOrderId = new Map<string, number>();
    for (const item of (items ?? []) as OrderItemRow[]) {
      if (!item.product_id) continue;
      const product = productById.get(item.product_id);
      const sellPrice = toSafeMoney(item.price);
      const basePrice = toSafeMoney(product?.price);
      const quantity = toSafeMoney(item.quantity);
      const itemProfit = Math.max(0, sellPrice - basePrice) * quantity;
      fullProfitByOrderId.set(item.order_id, (fullProfitByOrderId.get(item.order_id) ?? 0) + itemProfit);
    }

    let orderCount = 0;
    const revenue = ordersInWindow.reduce((sum, order) => {
      const fullOrderProfit = fullProfitByOrderId.get(order.id) ?? 0;
      if (fullOrderProfit <= 0) return sum;
      const paidRatio = getPaidRatio(order);
      if (paidRatio <= 0) return sum;
      orderCount += 1;
      return sum + fullOrderProfit * paidRatio;
    }, 0);

    return NextResponse.json({
      revenue,
      orderCount,
      windowStartIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
