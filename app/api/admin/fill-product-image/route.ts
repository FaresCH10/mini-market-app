import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchProductImageUrls } from "@/lib/product-image-search";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    return NextResponse.json({ ok: false, error: "productId is required." }, { status: 400 });
  }

  const { data: product, error: fetchError } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .single();

  if (fetchError || !product) {
    return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
  }

  let imageUrls: string[];
  try {
    imageUrls = await searchProductImageUrls(product.name);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "GROQ_API_KEY not configured") {
      return NextResponse.json({ ok: false, error: "GROQ_API_KEY not configured." }, { status: 503 });
    }
    console.error("[fill-product-image]", e);
    return NextResponse.json({ ok: false, error: "Image search failed." }, { status: 500 });
  }

  const first = imageUrls[0];
  if (!first) {
    return NextResponse.json({
      ok: true,
      status: "skipped" as const,
      reason: "no_match",
    });
  }

  const { error: updateError } = await supabase.from("products").update({ image_url: first }).eq("id", productId);

  if (updateError) {
    console.error("[fill-product-image] update", updateError);
    return NextResponse.json({ ok: false, error: "Failed to update product." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: "updated" as const,
    imageUrl: first,
  });
}
