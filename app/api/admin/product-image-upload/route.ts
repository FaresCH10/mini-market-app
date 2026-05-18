import { NextRequest, NextResponse } from "next/server";
import { uploadToR2, buildSafeR2Filename } from "@/lib/r2/client";
import { removeBackgroundAndOptimizeProductImage } from "@/lib/images/remove-bg";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 }) };
  }

  return { ok: true as const, userId: user.id };
};

export async function POST(req: NextRequest) {
  const removeBgApiKey = process.env.REMOVE_BG_API_KEY;
  if (!removeBgApiKey) {
    return NextResponse.json({ ok: false, error: "REMOVE_BG_API_KEY not configured." }, { status: 503 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Image file is required." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "Only image uploads are allowed." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "Image is too large (max 8MB)." }, { status: 413 });
  }

  try {
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const safeName = buildSafeR2Filename(baseName, "product");
    const key = `products/${auth.userId}/${Date.now()}-${safeName}.webp`;
    const bytes = await file.arrayBuffer();
    const optimizedImage = await removeBackgroundAndOptimizeProductImage(bytes, removeBgApiKey);
    const { publicUrl } = await uploadToR2({
      key,
      body: optimizedImage,
      contentType: "image/webp",
    });

    return NextResponse.json({ ok: true, imageUrl: publicUrl });
  } catch (error) {
    console.error("[product-image-upload]", error);
    return NextResponse.json({ ok: false, error: "Image upload failed." }, { status: 500 });
  }
}
