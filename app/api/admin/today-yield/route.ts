import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createServiceSupabase } from "@supabase/supabase-js";

type OrderRow = {
  id: string;
  total_price: number;
  paid_amount: number;
  type: string;
  status: string;
  payment_status: string;
  created_at: string;
  user_id: string;
};

type OrderItemRow = {
  order_id: string;
  product_name: string;
  quantity: number;
  price: number;
};

export async function GET() {
  try {
    const authClient = await createServerSupabase();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await authClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server not configured." }, { status: 500 });
    }

    const adminClient = createServiceSupabase(supabaseUrl, serviceRoleKey);

    // Daily cutoff is 1:00 AM. If current time is before 1am, use yesterday's 1am.
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(1, 0, 0, 0);
    if (now < cutoff) {
      cutoff.setDate(cutoff.getDate() - 1);
    }

    const { data: ordersData, error: ordersError } = await adminClient
      .from("orders")
      .select("id, total_price, paid_amount, type, status, payment_status, created_at, user_id")
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false });

    if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 });

    const orders = (ordersData ?? []) as OrderRow[];
    if (orders.length === 0) {
      return NextResponse.json({ users: [], cutoff: cutoff.toISOString() });
    }

    const userIds = [...new Set(orders.map((o) => o.user_id))];
    const orderIds = orders.map((o) => o.id);

    const [{ data: profilesData }, { data: itemsData, error: itemsError }] = await Promise.all([
      adminClient.from("profiles").select("id, name, email").in("id", userIds),
      adminClient
        .from("order_items")
        .select("order_id, product_name, quantity, price")
        .in("order_id", orderIds),
    ]);

    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

    const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p]));
    const itemsByOrderId = new Map<string, OrderItemRow[]>();
    for (const item of (itemsData ?? []) as OrderItemRow[]) {
      const list = itemsByOrderId.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.order_id, list);
    }

    // Group orders by user
    const userMap = new Map<string, {
      user_id: string;
      user_name: string;
      user_email: string;
      orders: (OrderRow & { items: OrderItemRow[] })[];
      total_spent: number;
      total_paid: number;
    }>();

    for (const order of orders) {
      const p = profilesById.get(order.user_id);
      if (!userMap.has(order.user_id)) {
        userMap.set(order.user_id, {
          user_id: order.user_id,
          user_name: p?.name ?? "Unknown",
          user_email: p?.email ?? "Unknown",
          orders: [],
          total_spent: 0,
          total_paid: 0,
        });
      }
      const entry = userMap.get(order.user_id)!;
      entry.orders.push({ ...order, items: itemsByOrderId.get(order.id) ?? [] });
      entry.total_spent += order.total_price;
      entry.total_paid += order.paid_amount ?? 0;
    }

    return NextResponse.json({ users: [...userMap.values()], cutoff: cutoff.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
