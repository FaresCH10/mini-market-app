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

const getAdminServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return createServiceSupabase(supabaseUrl, serviceRoleKey);
};

const requireAdmin = async () => {
  const authClient = await createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const adminClient = getAdminServiceClient();
  if (!adminClient) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Server is not configured." }, { status: 500 }),
    };
  }

  return { ok: true as const, adminClient };
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;
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

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const { error: itemsError } = await adminClient
      .from("order_items")
      .delete()
      .eq("order_id", orderId);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const { data: deletedRows, error: orderError } = await adminClient
      .from("orders")
      .delete()
      .eq("id", orderId)
      .select("id");
    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json({ error: "Order not found or not deleted" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, orderId: deletedRows[0].id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

