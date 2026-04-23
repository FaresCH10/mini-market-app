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
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
};

type ProductRow = {
  id: string;
  name: string;
  price: number;
  sell_price: number | null;
  quantity: number;
};

type PatchItemInput = {
  product_id: string;
  quantity: number;
};

const getSellPrice = (product: ProductRow): number =>
  Number(product.sell_price ?? Number((Number(product.price ?? 0) * 1.2).toFixed(2)));

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
        .select("order_id, product_id, product_name, quantity, price")
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

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    const body = (await req.json()) as { orderId?: string; items?: PatchItemInput[] };
    const orderId = body.orderId;
    const items = body.items;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order must contain at least one item" }, { status: 400 });
    }

    const normalizedItems: PatchItemInput[] = [];
    for (const item of items) {
      const productId = String(item.product_id ?? "").trim();
      const quantity = Number(item.quantity);
      if (!productId) {
        return NextResponse.json({ error: "Each item must include a product_id" }, { status: 400 });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ error: "Each item must have quantity greater than 0" }, { status: 400 });
      }
      normalizedItems.push({
        product_id: productId,
        quantity: Math.floor(quantity),
      });
    }

    const [{ data: orderRow, error: orderError }, { data: oldItems, error: oldItemsError }] = await Promise.all([
      adminClient.from("orders").select("id, total_price").eq("id", orderId).maybeSingle(),
      adminClient.from("order_items").select("order_id, product_id, quantity").eq("order_id", orderId),
    ]);

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
    if (!orderRow) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (oldItemsError) {
      return NextResponse.json({ error: oldItemsError.message }, { status: 500 });
    }

    const requestedProductIds = [...new Set(normalizedItems.map((item) => item.product_id))];
    const { data: productRows, error: productsError } = await adminClient
      .from("products")
      .select("id, name, price, sell_price, quantity")
      .in("id", requestedProductIds);
    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    const products = (productRows ?? []) as ProductRow[];
    const productsById = new Map(products.map((product) => [product.id, product]));
    for (const productId of requestedProductIds) {
      if (!productsById.has(productId)) {
        return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 400 });
      }
    }

    const oldQtyByProduct = new Map<string, number>();
    for (const oldItem of (oldItems ?? []) as Array<{ product_id: string | null; quantity: number }>) {
      if (!oldItem.product_id) continue;
      oldQtyByProduct.set(
        oldItem.product_id,
        (oldQtyByProduct.get(oldItem.product_id) ?? 0) + Number(oldItem.quantity ?? 0),
      );
    }

    const newQtyByProduct = new Map<string, number>();
    for (const item of normalizedItems) {
      newQtyByProduct.set(item.product_id, (newQtyByProduct.get(item.product_id) ?? 0) + item.quantity);
    }

    const allProductIds = [...new Set([...oldQtyByProduct.keys(), ...newQtyByProduct.keys()])];
    const stockUpdates: Array<{ id: string; nextQuantity: number }> = [];
    for (const productId of allProductIds) {
      const oldQty = oldQtyByProduct.get(productId) ?? 0;
      const newQty = newQtyByProduct.get(productId) ?? 0;
      const delta = newQty - oldQty;
      if (delta === 0) continue;

      const product = productsById.get(productId);
      if (!product) {
        // Product might only be in old items and no longer in requested items.
        const { data: oldProduct, error: oldProductError } = await adminClient
          .from("products")
          .select("id, quantity")
          .eq("id", productId)
          .maybeSingle();
        if (oldProductError || !oldProduct) {
          return NextResponse.json({ error: `Product not found for stock update: ${productId}` }, { status: 400 });
        }
        const currentQuantity = Number(oldProduct.quantity ?? 0);
        const nextQuantity = currentQuantity - delta;
        if (nextQuantity < 0) {
          return NextResponse.json({ error: `Insufficient stock for product ${productId}` }, { status: 400 });
        }
        stockUpdates.push({ id: productId, nextQuantity });
        continue;
      }

      const currentQuantity = Number(product.quantity ?? 0);
      const nextQuantity = currentQuantity - delta;
      if (nextQuantity < 0) {
        return NextResponse.json({ error: `Insufficient stock for ${product.name}` }, { status: 400 });
      }
      stockUpdates.push({ id: productId, nextQuantity });
    }

    for (const update of stockUpdates) {
      const { error: stockError } = await adminClient
        .from("products")
        .update({ quantity: update.nextQuantity })
        .eq("id", update.id);
      if (stockError) {
        return NextResponse.json({ error: stockError.message }, { status: 500 });
      }
    }

    const { error: deleteItemsError } = await adminClient
      .from("order_items")
      .delete()
      .eq("order_id", orderId);
    if (deleteItemsError) {
      return NextResponse.json({ error: deleteItemsError.message }, { status: 500 });
    }

    const preparedItems = normalizedItems.map((item) => {
      const product = productsById.get(item.product_id)!;
      const sellPrice = getSellPrice(product);
      return {
        order_id: orderId,
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        price: sellPrice,
      };
    });

    const { data: insertedItems, error: insertItemsError } = await adminClient
      .from("order_items")
      .insert(preparedItems)
      .select("order_id, product_id, product_name, quantity, price");
    if (insertItemsError) {
      return NextResponse.json({ error: insertItemsError.message }, { status: 500 });
    }

    const totalPrice = preparedItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const { error: orderUpdateError } = await adminClient
      .from("orders")
      .update({ total_price: totalPrice })
      .eq("id", orderId);
    if (orderUpdateError) {
      return NextResponse.json({ error: orderUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({
      updated: true,
      order: {
        id: orderId,
        total_price: totalPrice,
        items: insertedItems ?? [],
      },
    });
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

    const { data: orderRow, error: orderLookupError } = await adminClient
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderLookupError) {
      return NextResponse.json({ error: orderLookupError.message }, { status: 500 });
    }
    if (!orderRow) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: orderItems, error: orderItemsError } = await adminClient
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", orderId);
    if (orderItemsError) {
      return NextResponse.json({ error: orderItemsError.message }, { status: 500 });
    }

    const qtyToRestoreByProduct = new Map<string, number>();
    for (const item of (orderItems ?? []) as Array<{ product_id: string | null; quantity: number }>) {
      if (!item.product_id) continue;
      qtyToRestoreByProduct.set(
        item.product_id,
        (qtyToRestoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity ?? 0),
      );
    }

    const productIds = [...qtyToRestoreByProduct.keys()];
    if (productIds.length > 0) {
      const { data: productRows, error: productsError } = await adminClient
        .from("products")
        .select("id, quantity")
        .in("id", productIds);
      if (productsError) {
        return NextResponse.json({ error: productsError.message }, { status: 500 });
      }

      const productById = new Map((productRows ?? []).map((row) => [row.id, Number(row.quantity ?? 0)]));
      for (const productId of productIds) {
        if (!productById.has(productId)) {
          return NextResponse.json({ error: `Product not found for stock restore: ${productId}` }, { status: 400 });
        }
      }

      for (const productId of productIds) {
        const currentQty = productById.get(productId) ?? 0;
        const restoreQty = qtyToRestoreByProduct.get(productId) ?? 0;
        const { error: stockUpdateError } = await adminClient
          .from("products")
          .update({ quantity: currentQty + restoreQty })
          .eq("id", productId);
        if (stockUpdateError) {
          return NextResponse.json({ error: stockUpdateError.message }, { status: 500 });
        }
      }
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

