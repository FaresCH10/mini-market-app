import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchProductImageUrls } from "@/lib/product-image-search";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const productName = typeof body?.productName === "string" ? body.productName.trim() : "";
  if (!productName) {
    return NextResponse.json({ error: "Product name is required." }, { status: 400 });
  }

  try {
    const imageUrls = await searchProductImageUrls(productName);
    if (imageUrls.length > 0) {
      return NextResponse.json({ imageUrls });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "GROQ_API_KEY not configured") {
      return NextResponse.json({ error: "GROQ_API_KEY not configured." }, { status: 503 });
    }
    console.error("[search-product-image]", e);
    return NextResponse.json({ error: "Image search failed." }, { status: 500 });
  }

  return NextResponse.json(
    { error: `No images found for "${productName}". Try uploading manually.` },
    { status: 404 },
  );
}
