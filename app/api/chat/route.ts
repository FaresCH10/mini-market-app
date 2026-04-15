import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { formatLira, liraToK } from "@/lib/currency";

// ─── Lazy clients — created inside the handler to avoid module-level crashes
//     if env vars are missing (which would break the entire app startup).
function getGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY environment variable is not set");
  return new Groq({ apiKey });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are not set");
  return createClient(url, key);
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const USER_TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_products",
      description:
        "List all available products with name, price (in L.L), and stock quantity.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cart",
      description: "Get the current user's cart items.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description:
        "Add a product to the cart or increase its quantity. Always call get_products first. Use product_id from that list, OR product_name (exact wording from the catalog) if you do not have the id.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "UUID from get_products (preferred)" },
          product_name: {
            type: "string",
            description: "Product name as shown in get_products; use when calling add in the same turn as get_products",
          },
          quantity: { type: "number", description: "Whole number of units to add (at least 1)" },
        },
        required: ["quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "empty_cart",
      description: "Remove every item from the user's cart (clear the entire cart).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_cart_quantity",
      description: "Set the exact quantity of a cart item.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          quantity: {
            type: "number",
            description: "New quantity (must be > 0)",
          },
        },
        required: ["product_id", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description: "Remove a product from the cart entirely (all units).",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decrease_cart_quantity",
      description: "Remove a specific number of units of a product from the cart. If the result is 0 or less, the item is removed entirely. Call get_cart first to find the product_id.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          amount: { type: "number", description: "Number of units to remove" },
        },
        required: ["product_id", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_purchase",
      description: `Place an order for all cart items. Call this immediately — do NOT ask for confirmation first.
- "pay now" / "buy" / "purchase" / "pay in full" → payment_type = "pay_now"
- "debt" / "pay later" / "on debt" / "I'll pay later" → payment_type = "debt"
- "pay X now" / "half now" / "split" → payment_type = "split", paid_now = the amount paying now (number in L.L)`,
      parameters: {
        type: "object",
        properties: {
          payment_type: {
            type: "string",
            enum: ["pay_now", "debt", "split"],
            description: "pay_now = full payment now. debt = full amount as debt. split = partial payment now, rest as debt.",
          },
          paid_now: {
            anyOf: [{ type: "number" }, { type: "null" }],
            description: "Only required for payment_type=split: the amount paying now in L.L. Omit or null for pay_now and debt.",
          },
        },
        required: ["payment_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_orders",
      description: "Get the current user's full order history.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_debts",
      description: "Get the current user's outstanding (unpaid or partially paid) debt orders. Use this when the user asks about what they owe, their debt, or how much they need to pay.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "pay_debt",
      description: "Record a payment toward one of the user's outstanding debt orders. Call get_my_debts first to get the order_id. Pass a specific amount in L.L, or null to pay the full remaining balance.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "The debt order ID from get_my_debts" },
          amount: {
            anyOf: [{ type: "number" }, { type: "null" }],
            description: "Amount to pay in L.L. Pass null to pay the full remaining balance.",
          },
        },
        required: ["order_id", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to",
      description: "Navigate the user's browser to a page. Use this when the user asks to go to, open, show, or visit a page (e.g. 'show me my cart', 'go to my orders', 'open products').",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            enum: ["/", "/cart", "/profile", "/debt"],
            description: "The page path to navigate to. / = home/products, /cart = cart, /profile = orders & profile, /debt = debt payment page",
          },
        },
        required: ["path"],
      },
    },
  },
];

const ADMIN_EXTRA_TOOLS: Groq.Chat.ChatCompletionTool[] = [
  // ── Navigation ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "admin_navigate_to",
      description: "Navigate the admin's browser to a page. ALWAYS call this when the admin mentions or asks about any page.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            enum: ["/admin", "/admin/products", "/admin/orders", "/admin/debt", "/admin/users"],
            description: "/admin=dashboard, /admin/products=products, /admin/orders=orders, /admin/debt=debts, /admin/users=users",
          },
        },
        required: ["path"],
      },
    },
  },
  // ── Dashboard ───────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "admin_get_dashboard_stats",
      description: "Admin: Get dashboard statistics — total revenue, outstanding debt, total orders, product count, user count, pending debt count.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Orders ──────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "admin_get_all_orders",
      description: "Admin: Get all orders from all users with user info and items.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Products ────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "admin_add_product",
      description: "Admin: Add a new product to the store. Price is in L.L.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          quantity: { type: "number" },
          image_url: { type: "string" },
        },
        required: ["name", "price", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_edit_product",
      description: "Admin: Edit an existing product's name, price (L.L), or stock quantity. Call get_products first to get the product_id.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          name: { type: "string" },
          price: { type: "number" },
          quantity: { type: "number" },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_delete_product",
      description: "Admin: Delete a product from the store. Call get_products first to get the product_id.",
      parameters: {
        type: "object",
        properties: { product_id: { type: "string" } },
        required: ["product_id"],
      },
    },
  },
  // ── Debts ───────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "admin_get_debts",
      description: "Admin: Get all debt orders with user info, items, amount paid, and amount remaining.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_update_debt",
      description: "Admin: Record a payment on a debt order. Set paid_amount to the new total amount paid and payment_status accordingly. Call admin_get_debts first to get the order_id.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          paid_amount: { type: "number", description: "New total paid amount in L.L" },
          payment_status: { type: "string", enum: ["pending", "partial", "paid"] },
        },
        required: ["order_id", "paid_amount", "payment_status"],
      },
    },
  },
  // ── Users ───────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "admin_get_all_users",
      description: "Admin: Get all registered users with name, email, role, and account creation date.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_toggle_user_role",
      description: "Admin: Change a user's role to 'admin' or 'user'.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          role: { type: "string", enum: ["admin", "user"] },
        },
        required: ["email", "role"],
      },
    },
  },
];

// ─── Currency helper ─────────────────────────────────────────────────────────

function fmt(amount: number) {
  return formatLira(amount);
}

/** Resolve a product by id (preferred) or catalog name so the model is not forced to copy UUIDs perfectly. */
async function resolveProductForCart(
  supabase: ReturnType<typeof getSupabase>,
  args: { product_id?: string; product_name?: string },
): Promise<
  { ok: true; id: string; name: string; stock: number } | { ok: false; message: string }
> {
  const idRaw = typeof args.product_id === "string" ? args.product_id.trim() : "";
  const nameRaw = typeof args.product_name === "string" ? args.product_name.trim() : "";

  if (!idRaw && !nameRaw) {
    return { ok: false, message: "Provide product_id from get_products or product_name." };
  }

  if (idRaw) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, quantity")
      .eq("id", idRaw)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (data) return { ok: true, id: data.id, name: data.name, stock: data.quantity };
  }

  if (nameRaw) {
    const { data: rows, error } = await supabase
      .from("products")
      .select("id, name, quantity")
      .ilike("name", nameRaw);
    if (error) return { ok: false, message: error.message };
    const list = rows ?? [];
    const exact = list.filter((p) => p.name.toLowerCase() === nameRaw.toLowerCase());
    const narrowed = exact.length > 0 ? exact : list;
    if (narrowed.length === 1) {
      const p = narrowed[0];
      return { ok: true, id: p.id, name: p.name, stock: p.quantity };
    }
    if (narrowed.length > 1) {
      return {
        ok: false,
        message: `Multiple products match "${nameRaw}": ${narrowed.map((p) => p.name).join(", ")}. Use product_id from get_products.`,
      };
    }

    const { data: fuzzy } = await supabase
      .from("products")
      .select("id, name, quantity")
      .ilike("name", `%${nameRaw}%`);
    const fz = fuzzy ?? [];
    if (fz.length === 1) {
      const p = fz[0];
      return { ok: true, id: p.id, name: p.name, stock: p.quantity };
    }
    if (fz.length > 1) {
      return {
        ok: false,
        message: `Several products contain "${nameRaw}": ${fz.map((p) => p.name).join(", ")}. Use product_id from get_products.`,
      };
    }
  }

  return {
    ok: false,
    message: "Product not found. Call get_products first, then add_to_cart using product_id or the exact product name.",
  };
}

// ─── Tool executor ───────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  supabase: ReturnType<typeof getSupabase>,
): Promise<string> {
  try {
    switch (name) {
      case "get_products": {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, price, sell_price, quantity")
          .order("name");
        if (error) throw error;
        return JSON.stringify(data);
      }

      case "get_cart": {
        const { data, error } = await supabase
          .from("carts")
          .select("id, quantity, products(id, name, price, sell_price)")
          .eq("user_id", userId);
        if (error) throw error;
        return JSON.stringify(data);
      }

      case "add_to_cart": {
        const raw = args as { product_id?: string; product_name?: string; quantity: unknown };
        const qty =
          typeof raw.quantity === "number" && Number.isFinite(raw.quantity)
            ? Math.floor(raw.quantity)
            : NaN;
        if (!Number.isFinite(qty) || qty < 1) {
          return JSON.stringify({ error: "Quantity must be a whole number ≥ 1." });
        }

        const resolved = await resolveProductForCart(supabase, {
          product_id: raw.product_id,
          product_name: raw.product_name,
        });
        if (!resolved.ok) return JSON.stringify({ error: resolved.message });

        const product_id = resolved.id;

        const { data: existing, error: existingErr } = await supabase
          .from("carts")
          .select("id, quantity")
          .eq("user_id", userId)
          .eq("product_id", product_id)
          .maybeSingle();
        if (existingErr) return JSON.stringify({ error: existingErr.message });

        const newQty = (existing?.quantity ?? 0) + qty;
        if (newQty > resolved.stock) {
          return JSON.stringify({
            error: `Only ${resolved.stock} units of "${resolved.name}" in stock`,
          });
        }

        if (existing) {
          const { error: upErr } = await supabase
            .from("carts")
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (upErr) return JSON.stringify({ error: upErr.message });
        } else {
          const { error: insErr } = await supabase
            .from("carts")
            .insert({ user_id: userId, product_id, quantity: qty });
          if (insErr) return JSON.stringify({ error: insErr.message });
        }
        return JSON.stringify({
          success: true,
          message: `Added ${qty}x "${resolved.name}" to cart`,
        });
      }

      case "empty_cart": {
        const { error } = await supabase.from("carts").delete().eq("user_id", userId);
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: "Your cart is now empty." });
      }

      case "update_cart_quantity": {
        const { product_id, quantity } = args as { product_id: string; quantity: number };
        if (quantity <= 0)
          return JSON.stringify({
            error: "Quantity must be > 0. Use remove_from_cart to delete.",
          });

        const { data: product } = await supabase
          .from("products")
          .select("quantity, name")
          .eq("id", product_id)
          .single();
        if (!product) return JSON.stringify({ error: "Product not found" });
        if (quantity > (product as { quantity: number }).quantity)
          return JSON.stringify({
            error: `Only ${(product as { quantity: number }).quantity} units in stock`,
          });

        await supabase
          .from("carts")
          .update({ quantity, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("product_id", product_id);
        return JSON.stringify({
          success: true,
          message: `Updated "${(product as { name: string }).name}" quantity to ${quantity}`,
        });
      }

      case "remove_from_cart": {
        await supabase
          .from("carts")
          .delete()
          .eq("user_id", userId)
          .eq("product_id", (args as { product_id: string }).product_id);
        return JSON.stringify({ success: true, message: "Item removed from cart" });
      }

      case "decrease_cart_quantity": {
        const { product_id, amount } = args as { product_id: string; amount: number };
        const { data: existing } = await supabase
          .from("carts")
          .select("quantity, products(name)")
          .eq("user_id", userId)
          .eq("product_id", product_id)
          .single();

        if (!existing) return JSON.stringify({ error: "Item not found in cart" });

        const row = existing as unknown as {
          quantity: number;
          products: { name: string } | { name: string }[] | null;
        };
        const current = row.quantity;
        const productName = Array.isArray(row.products)
          ? row.products[0]?.name ?? "Item"
          : row.products?.name ?? "Item";
        const newQty = current - amount;

        if (newQty <= 0) {
          await supabase.from("carts").delete().eq("user_id", userId).eq("product_id", product_id);
          return JSON.stringify({ success: true, message: `Removed all "${productName}" from cart (was ${current}).` });
        }

        await supabase
          .from("carts")
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("product_id", product_id);

        return JSON.stringify({ success: true, message: `Removed ${amount} unit(s) of "${productName}". New quantity: ${newQty}.` });
      }

      case "confirm_purchase": {
        // Two explicit queries — avoids FK join ambiguity with the service-role client
        const { data: cartRaw, error: cartError } = await supabase
          .from("carts")
          .select("product_id, quantity")
          .eq("user_id", userId);
        if (cartError) throw new Error(`Cart fetch failed: ${cartError.message}`);
        if (!cartRaw || cartRaw.length === 0)
          return JSON.stringify({ error: "Cart is empty" });

        const productIds = (cartRaw as { product_id: string; quantity: number }[]).map((r) => r.product_id);
        const { data: productsRaw, error: prodError } = await supabase
          .from("products")
          .select("id, name, price, sell_price, quantity")
          .in("id", productIds);
        if (prodError) throw new Error(`Products fetch failed: ${prodError.message}`);

        type ProductRow = { id: string; name: string; price: number; sell_price: number | null; quantity: number };
        const productMap = Object.fromEntries(
          (productsRaw as ProductRow[]).map((p) => [p.id, p]),
        );

        const items = (cartRaw as { product_id: string; quantity: number }[]).map((row) => {
          const product = productMap[row.product_id];
          if (!product) throw new Error(`Product ${row.product_id} not found`);
          return { quantity: row.quantity, product };
        });

        const total = items.reduce((sum, item) => {
          const sellPrice = Number(item.product.sell_price ?? Number((item.product.price * 1.2).toFixed(2)));
          return sum + sellPrice * item.quantity;
        }, 0);

        const { payment_type: paymentType, paid_now: paidNowArg } = args as { payment_type?: string; paid_now?: number };
        let paidNow: number;
        if (paymentType === "debt") {
          paidNow = 0;
        } else if (paymentType === "split" && typeof paidNowArg === "number") {
          paidNow = Math.max(0, Math.min(liraToK(paidNowArg), total));
        } else {
          paidNow = total; // pay_now or fallback
        }
        const debtAmount = total - paidNow;
        const isFullPayment = debtAmount === 0;
        const orderType = isFullPayment ? "purchase" : "dept";
        const paymentStatus = isFullPayment ? "paid" : paidNow > 0 ? "partial" : "pending";

        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert({
            user_id: userId,
            total_price: total,
            type: orderType,
            status: isFullPayment ? "completed" : "pending",
            payment_status: paymentStatus,
            paid_amount: paidNow,
          })
          .select()
          .single();
        if (orderError) throw orderError;

        const orderId = (order as { id: string }).id;

        const { error: itemsError } = await supabase.from("order_items").insert(
          items.map((item) => ({
            // Store sell price at purchase-time for accurate revenue reporting.
            price: Number(item.product.sell_price ?? Number((item.product.price * 1.2).toFixed(2))),
            order_id: orderId,
            product_id: item.product.id,
            product_name: item.product.name,
            quantity: item.quantity,
          })),
        );
        if (itemsError) throw itemsError;

        await Promise.all(
          items.map((item) =>
            supabase
              .from("products")
              .update({ quantity: item.product.quantity - item.quantity })
              .eq("id", item.product.id),
          ),
        );

        await supabase.from("carts").delete().eq("user_id", userId);

        return JSON.stringify({
          success: true,
          total: fmt(total),
          paid_now: fmt(paidNow),
          debt: fmt(debtAmount),
          message: isFullPayment
            ? `Order placed! Paid ${fmt(total)} in full.`
            : paidNow > 0
              ? `Order placed! Paid ${fmt(paidNow)} now, ${fmt(debtAmount)} recorded as debt.`
              : `Order recorded as debt. You owe ${fmt(total)}. Visit /debt to pay later.`,
        });
      }

      case "navigate_to":
      case "admin_navigate_to": {
        const { path } = args as { path: string };
        return JSON.stringify({ success: true, navigating_to: path });
      }

      case "get_my_orders": {
        const { data, error } = await supabase
          .from("orders")
          .select(
            "total_price, type, status, payment_status, paid_amount, created_at, order_items(product_name, quantity, price)",
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return JSON.stringify(data);
      }

      case "get_my_debts": {
        const { data, error } = await supabase
          .from("orders")
          .select("id, total_price, paid_amount, payment_status, created_at, order_items(product_name, quantity, price)")
          .eq("user_id", userId)
          .eq("type", "dept")
          .neq("payment_status", "paid")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const debts = ((data ?? []) as Array<{
          id: string; total_price: number; paid_amount: number;
          payment_status: string; created_at: string;
          order_items: Array<{ product_name: string; quantity: number; price: number }>;
        }>).map((o) => ({
          order_id: o.id,
          total: fmt(o.total_price),
          paid: fmt(o.paid_amount ?? 0),
          remaining: fmt(o.total_price - (o.paid_amount ?? 0)),
          status: o.payment_status,
          date: o.created_at,
          items: o.order_items.map((i) => `${i.product_name} x${i.quantity}`).join(", "),
        }));
        if (debts.length === 0) return JSON.stringify({ message: "You have no outstanding debts." });
        return JSON.stringify({ outstanding_debts: debts, count: debts.length });
      }

      case "pay_debt": {
        const { order_id, amount: rawAmount } = args as { order_id: string; amount: number | null };
        if (!order_id) return JSON.stringify({ error: "Provide a valid order_id." });

        const { data: order, error: fetchErr } = await supabase
          .from("orders")
          .select("id, total_price, paid_amount, payment_status, user_id")
          .eq("id", order_id)
          .eq("user_id", userId)
          .eq("type", "dept")
          .single();
        if (fetchErr || !order) return JSON.stringify({ error: "Debt order not found." });

        const o = order as { id: string; total_price: number; paid_amount: number; payment_status: string; user_id: string };
        const remaining = o.total_price - (o.paid_amount ?? 0);
        if (remaining <= 0) return JSON.stringify({ error: "This debt is already fully paid." });

        // null or 0 means pay the full remaining balance
        const paying = (rawAmount === null || rawAmount <= 0) ? remaining : Math.min(liraToK(rawAmount), remaining);
        const newPaid = (o.paid_amount ?? 0) + paying;
        const isFullyPaid = newPaid >= o.total_price;
        const newStatus = isFullyPaid ? "paid" : "partial";

        const { error: updateErr } = await supabase
          .from("orders")
          .update({
            paid_amount: newPaid,
            payment_status: newStatus,
            ...(isFullyPaid ? { status: "completed" } : {}),
          })
          .eq("id", order_id);
        if (updateErr) throw updateErr;

        return JSON.stringify({
          success: true,
          refresh_debt: true,
          paid: fmt(paying),
          total_paid: fmt(newPaid),
          remaining: fmt(o.total_price - newPaid),
          message: isFullyPaid
            ? `Debt fully paid! You paid ${fmt(paying)}. This order is now settled.`
            : `Payment of ${fmt(paying)} recorded. Remaining balance: ${fmt(o.total_price - newPaid)}.`,
        });
      }

      // ── Admin tools ──────────────────────────────────────────────────────

      case "admin_get_all_orders": {
        const { data: orders, error } = await supabase
          .from("orders")
          .select("id, user_id, total_price, type, status, payment_status, paid_amount, created_at, order_items(product_name, quantity, price)")
          .order("created_at", { ascending: false }).limit(50);
        if (error) throw error;

        const userIds = [...new Set((orders ?? []).map((o: Record<string, unknown>) => o.user_id as string))];
        const { data: profiles } = await supabase
          .from("profiles").select("id, name, email").in("id", userIds);
        const profileMap = Object.fromEntries(
          (profiles ?? []).map((p: Record<string, unknown>) => [p.id as string, p])
        );

        const enriched = (orders ?? []).map((o: Record<string, unknown>) => {
          const { id, user_id, ...rest } = o;
          const profile = profileMap[user_id as string] ?? { name: "Unknown", email: "" };
          // keep order_id for potential debt updates but label it clearly
          return { order_id: id, ...rest, user: { name: (profile as Record<string,unknown>).name, email: (profile as Record<string,unknown>).email } };
        });
        const cleanRows = enriched.map((o: Record<string, unknown>) => {
          const orderItems = (o.order_items as Array<{ product_name: string; quantity: number }> | undefined) ?? [];
          return {
            customer_name: (o.user as Record<string, unknown>)?.name ?? "Unknown",
            customer_email: (o.user as Record<string, unknown>)?.email ?? "",
            total_price: fmt((o.total_price as number) ?? 0),
            type: o.type,
            status: o.status,
            payment_status: o.payment_status,
            paid_amount: fmt((o.paid_amount as number) ?? 0),
            created_at: o.created_at,
            items_count: orderItems.length,
            items_preview: orderItems.slice(0, 3).map((i) => `${i.product_name} x${i.quantity}`).join(", "),
            order_ref: (o.order_id as string)?.slice(0, 8),
          };
        });
        return JSON.stringify({
          title: "Recent orders",
          total: cleanRows.length,
          rows: cleanRows,
        });
      }

      case "admin_add_product": {
        const { name, price, quantity, image_url } = args as { name: string; price: number; quantity: number; image_url?: string };
        const priceK = liraToK(price);
        const sell_price = Number((priceK * 1.2).toFixed(2));
        const { data, error } = await supabase
          .from("products")
          .insert({ name, price: priceK, sell_price, quantity, image_url })
          .select()
          .single();
        if (error) throw error;
        return JSON.stringify({ success: true, product: data });
      }

      case "admin_edit_product": {
        const { product_id, ...updates } = args as { product_id: string; [key: string]: unknown };
        if (typeof updates.price === "number" && Number.isFinite(updates.price)) {
          updates.price = liraToK(updates.price);
        }
        if (typeof updates.sell_price === "number" && Number.isFinite(updates.sell_price)) {
          updates.sell_price = liraToK(updates.sell_price);
        }
        if (typeof updates.price === "number" && Number.isFinite(updates.price) && updates.sell_price == null) {
          updates.sell_price = Number((updates.price * 1.2).toFixed(2));
        }
        const { data, error } = await supabase
          .from("products")
          .update(updates)
          .eq("id", product_id)
          .select()
          .single();
        if (error) throw error;
        return JSON.stringify({ success: true, product: data });
      }

      case "admin_delete_product": {
        const { error } = await supabase
          .from("products")
          .delete()
          .eq("id", (args as { product_id: string }).product_id);
        if (error) throw error;
        return JSON.stringify({ success: true, message: "Product deleted" });
      }

      case "admin_get_debts": {
        const { data: debtOrders, error } = await supabase
          .from("orders")
          .select("id, user_id, total_price, paid_amount, payment_status, created_at, order_items(product_name, quantity, price)")
          .eq("type", "dept")
          .order("created_at", { ascending: false });
        if (error) throw error;

        const userIds = [...new Set((debtOrders ?? []).map((o: Record<string, unknown>) => o.user_id as string))];
        const { data: profiles } = await supabase
          .from("profiles").select("id, name, email").in("id", userIds);
        const profileMap = Object.fromEntries(
          (profiles ?? []).map((p: Record<string, unknown>) => [p.id as string, p])
        );

        const enriched = (debtOrders ?? []).map((o: Record<string, unknown>) => {
          const { id, user_id, ...rest } = o;
          const profile = profileMap[user_id as string] ?? { name: "Unknown", email: "" };
          return { order_id: id, ...rest, user: { name: (profile as Record<string,unknown>).name, email: (profile as Record<string,unknown>).email } };
        });
        return JSON.stringify(enriched);
      }

      case "admin_update_debt": {
        const { order_id, paid_amount, payment_status } = args as { order_id: string; paid_amount?: number; payment_status?: string };

        const updates: Record<string, unknown> = {};
        if (paid_amount !== undefined) updates.paid_amount = liraToK(paid_amount);
        if (payment_status) updates.payment_status = payment_status;
        if (payment_status === "paid") updates.status = "completed";

        const { data, error } = await supabase
          .from("orders")
          .update(updates)
          .eq("id", order_id)
          .select()
          .single();
        if (error) throw error;

        return JSON.stringify({ success: true, order: data });
      }

      case "admin_get_dashboard_stats": {
        const now = new Date();
        const revenueWindowStart = new Date(now);
        revenueWindowStart.setHours(1, 0, 0, 0);
        if (now.getHours() < 1) {
          revenueWindowStart.setDate(revenueWindowStart.getDate() - 1);
        }

        const [
          { count: totalProducts },
          { count: totalUsers },
          { data: orderStats },
        ] = await Promise.all([
          supabase.from("products").select("*", { count: "exact", head: true }),
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase
            .from("orders")
            .select("total_price, paid_amount, type, payment_status, created_at"),
        ]);

        const orders = (orderStats ?? []) as Array<{
          total_price: number;
          paid_amount: number;
          type: string;
          payment_status: string;
          created_at: string;
        }>;
        const totalOrders = orders.length;
        const revenue = orders
          .filter((o) => o.payment_status === "paid" && new Date(o.created_at) >= revenueWindowStart)
          .reduce((s, o) => s + o.total_price, 0);
        const outstandingDebt = orders
          .filter((o) => o.type === "dept" && o.payment_status !== "paid")
          .reduce((s, o) => s + (o.total_price - (o.paid_amount ?? 0)), 0);
        const pendingDebtCount = orders.filter((o) => o.type === "dept" && o.payment_status !== "paid").length;

        return JSON.stringify({
          total_revenue: fmt(revenue),
          revenue_window_start: revenueWindowStart.toISOString(),
          outstanding_debt: fmt(outstandingDebt),
          total_orders: totalOrders,
          total_products: totalProducts ?? 0,
          total_users: totalUsers ?? 0,
          pending_debt_orders: pendingDebtCount,
        });
      }

      case "admin_get_all_users": {
        const { data, error } = await supabase
          .from("profiles")
          .select("name, email, role, created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data ?? []).map((u: Record<string, unknown>) => ({
          name: u.name,
          email: u.email,
          role: u.role,
          joined_at: u.created_at,
        }));
        return JSON.stringify({
          title: "All users",
          total: rows.length,
          rows,
        });
      }

      case "admin_toggle_user_role": {
        const { email, role: newRole } = args as { email: string; role: "admin" | "user" };
        const { data, error } = await supabase
          .from("profiles")
          .update({ role: newRole })
          .eq("email", email)
          .select("name, email, role")
          .single();
        if (error) throw error;
        return JSON.stringify({ success: true, user: data, message: `${(data as { name: string }).name} is now ${newRole === "admin" ? "an Admin" : "a regular User"}.` });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[executeTool] Error in", name, ":", msg);
    return JSON.stringify({ error: msg });
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    const { messages, userId } = body as { messages: Groq.Chat.ChatCompletionMessageParam[]; userId: string };
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Initialize clients inside the handler — safe even if env vars are missing (returns 500, not crash)
    const supabase = getSupabase();
    const groq = getGroq();

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, role")
      .eq("id", userId)
      .single();

    const role = (profile as { role: string } | null)?.role ?? "user";
    const userName = (profile as { name: string } | null)?.name ?? "there";
    const isAdmin = role === "admin";

    const tools = isAdmin ? [...USER_TOOLS, ...ADMIN_EXTRA_TOOLS] : USER_TOOLS;

    const systemPrompt = isAdmin
      ? `You are a smart AI assistant for NavyBits Market, a mini-market management system.
You are talking to ${userName}, who is an ADMIN.
CURRENCY: All prices and amounts are in full L.L. Always display as "X L.L" with thousands separators.
IMPORTANT: No wallet feature exists on this site. Never mention wallets or balances.

━━ NAVIGATION RULES ━━
ALWAYS call admin_navigate_to the moment the admin mentions any page — even while fetching data.
- "dashboard" / "home" / "overview" → /admin
- "products" / "catalog" / "inventory" → /admin/products
- "orders" / "purchases" → /admin/orders
- "debts" / "debt management" / "owed" → /admin/debt
- "users" / "customers" / "members" → /admin/users
For the admin's own personal pages use navigate_to: / (products), /cart, /profile, /debt.

━━ ADMIN CAPABILITIES ━━
DASHBOARD
- Stats (revenue, debt, orders, users): admin_get_dashboard_stats

PRODUCTS
- List all: get_products
- Add new: admin_add_product (name, price, quantity required; image_url optional)
- Edit existing: admin_edit_product — call get_products first for product_id, then pass only the fields to change
- Delete: admin_delete_product — call get_products first for product_id. Always confirm before deleting.

ORDERS
- View all orders: admin_get_all_orders (returns last 50 orders with customer info and items)
- Filter intent: when admin asks for "debt orders" → admin_get_debts; otherwise use admin_get_all_orders

DEBTS
- View all outstanding debts: admin_get_debts
- Record payment on a debt: admin_update_debt (needs order_id from admin_get_debts, paid_amount = NEW TOTAL paid, payment_status = "partial" or "paid")

USERS
- List all users: admin_get_all_users
- Change role to admin or user: admin_toggle_user_role (needs email + role). Always confirm before changing.

━━ ADMIN'S OWN SHOPPING (personal account) ━━
- Browse: get_products
- Cart: get_cart, add_to_cart (call get_products first to get product_id or use product_name), update_cart_quantity, decrease_cart_quantity, remove_from_cart, empty_cart
- Order: When placing an order, call get_cart then ask "Pay now or put on debt?" then call confirm_purchase:
  · "pay now"/"purchase" → payment_type="pay_now"
  · "debt"/"later" → payment_type="debt"
  · "pay X now"/"split" → payment_type="split", paid_now=X
- Order history: get_my_orders
- My debts: get_my_debts → pay_debt (amount=null to pay full balance, amount=X for specific amount)

━━ RESPONSE RULES ━━
- Present data as clean bullet lists — never dump raw JSON or UUIDs
- Use names, emails, dates, and L.L amounts only
- Be concise and professional`
      : `You are a friendly shopping assistant for NavyBits Market.
You are helping ${userName}.
CURRENCY: All prices are in full L.L. Always display as "X L.L" with thousands separators.
IMPORTANT: No wallet feature exists on this site. Never mention wallets or balances.

━━ NAVIGATION RULES ━━
ALWAYS call navigate_to the moment the user mentions any page — even while fetching data.
- "cart" / "view cart" / "show cart" / "open cart" / "my cart" → /cart
- "orders" / "my orders" / "history" / "profile" / "account" → /profile
- "products" / "shop" / "home" / "browse" / "catalog" → /
- "debt" / "my debt" / "what I owe" / "pay debt" / "outstanding" → /debt

━━ YOUR CAPABILITIES ━━
PRODUCTS
- List products + stock + prices: get_products

CART
- View cart: get_cart
- Add item: call get_products FIRST to get product_id or use exact product_name, then add_to_cart
- Increase quantity: update_cart_quantity (set exact new quantity)
- Decrease quantity: decrease_cart_quantity (removes X units; removes item if result ≤ 0)
- Remove item entirely: remove_from_cart
- Clear everything: empty_cart

ORDERING
When the user wants to place an order (says "buy", "purchase", "confirm order", "checkout", etc.):
1. Call get_cart to get the total (if you don't already have it)
2. Ask: "Would you like to pay now (X L.L) or put it on debt?"
3. Wait for their answer, then call confirm_purchase:
   - "pay now" / "pay in full" / "yes pay" → payment_type="pay_now"
   - "debt" / "pay later" / "on debt" / "later" → payment_type="debt"
   - "pay X now" / "half now" / "split" → payment_type="split", paid_now=X

DEBTS
- Check outstanding debts: get_my_debts (shows each debt with remaining balance)
- Pay debt: call get_my_debts first, then pay_debt with the order_id
  · "pay 50,000 L.L on my debt" / "pay 200,000 toward my order" → amount=50000 / amount=200000
  · "pay all my debt" / "settle my debt" / "pay everything" → amount=null (pays full remaining balance)
- View debt page: navigate_to /debt

ORDER HISTORY
- get_my_orders (full history of all orders)

━━ RESPONSE RULES ━━
- Be warm and concise
- Warn when stock is low (≤ 5 units)
- Never show UUIDs or raw IDs — use names, prices, dates, quantities only
- If a product isn't found, suggest calling get_products to browse`;

    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    let finalText = "";
    let navigateTo: string | undefined;
    // Tools that mutate the cart — the client should refresh its cart state after these
    const CART_MUTATING_TOOLS = new Set([
      "add_to_cart",
      "empty_cart",
      "remove_from_cart",
      "update_cart_quantity",
      "decrease_cart_quantity",
      "confirm_purchase",
    ]);
    let refreshCart = false;
    let refreshDebt = false;

    async function groqCreate(
      params: Omit<Parameters<typeof groq.chat.completions.create>[0], "model">,
    ): Promise<Groq.Chat.ChatCompletion> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await (groq.chat.completions.create as any)({
        ...params,
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        stream: false,
      })) as Groq.Chat.ChatCompletion;
    }

    // Agentic loop — max 8 iterations to prevent runaway chains
    for (let i = 0; i < 8; i++) {
      const response = await groqCreate({
        messages: groqMessages,
        tools,
        tool_choice: "auto",
        max_tokens: 1024,
      });

      const choice = response.choices[0];
      const msg = choice.message;
      groqMessages.push(msg as Groq.Chat.ChatCompletionMessageParam);

      if (choice.finish_reason === "tool_calls" && msg.tool_calls) {
        const toolResults = await Promise.all(
          msg.tool_calls.map(async (tc: Groq.Chat.ChatCompletionMessageToolCall) => {
            let args: Record<string, unknown>;
            let parseFailed = false;
            try {
              args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
            } catch {
              parseFailed = true;
              args = {};
            }

            // Track side-effects before executing
            if (!parseFailed) {
              if (tc.function.name === "navigate_to" || tc.function.name === "admin_navigate_to") {
                navigateTo = args.path as string;
              }
              if (CART_MUTATING_TOOLS.has(tc.function.name)) {
                refreshCart = true;
              }
              if (tc.function.name === "pay_debt") {
                refreshDebt = true;
              }
            }

            const content = parseFailed
              ? JSON.stringify({
                error: "Sorry, I couldn't understand that request. Please try again.",
              })
              : await executeTool(tc.function.name, args, userId, supabase);
            return {
              role: "tool" as const,
              tool_call_id: tc.id,
              content,
            };
          }),
        );
        groqMessages.push(...toolResults);
      } else {
        finalText = msg.content ?? "";
        break;
      }
    }

    if (!finalText.trim()) {
      const wrapUp = await groqCreate({
        messages: groqMessages,
        tool_choice: "none",
        max_tokens: 512,
      });
      finalText =
        wrapUp.choices[0]?.message?.content?.trim() ||
        "Done — check your cart or the page I opened for you.";
    }

    return NextResponse.json({ message: finalText, navigate_to: navigateTo, refresh_cart: refreshCart, refresh_debt: refreshDebt });
  } catch (err: unknown) {
    console.error("[/api/chat] Error:", err);
    const status = (err as { status?: number }).status;
    if (status === 429) {
      return NextResponse.json(
        { error: "The assistant is currently busy — please wait a moment and try again." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "Sorry — I couldn't complete that request. Please try again." },
      { status: 500 },
    );
  }
}
