import { NextRequest, NextResponse } from "next/server";
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
    const mode = req.nextUrl.searchParams.get("mode") ?? "all";

    let ordersQuery = adminClient
      .from("orders")
      .select("id, total_price, paid_amount, type, status, payment_status, created_at, user_id");

    if (mode === "debt") {
      ordersQuery = ordersQuery
        .eq("type", "dept")
        .neq("payment_status", "paid")
        .order("created_at", { ascending: true });
    } else {
      ordersQuery = ordersQuery.order("created_at", { ascending: false });
    }

    const { data: ordersData, error: ordersError } = await ordersQuery;
    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const orders = (ordersData ?? []) as OrderRow[];
    if (orders.length === 0) {
      return NextResponse.json({ orders: [] });
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

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p]));
    const itemsByOrderId = new Map<string, OrderItemRow[]>();
    for (const item of (itemsData ?? []) as OrderItemRow[]) {
      const list = itemsByOrderId.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.order_id, list);
    }

    const hydrated = orders.map((order) => {
      const userProfile = profilesById.get(order.user_id);
      return {
        ...order,
        user_name: userProfile?.name || "Unknown",
        user_email: userProfile?.email || "Unknown",
        items: itemsByOrderId.get(order.id) ?? [],
      };
    });

    return NextResponse.json({ orders: hydrated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

