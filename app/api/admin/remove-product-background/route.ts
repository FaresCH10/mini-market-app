import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PRODUCT_IMAGES_BUCKET = "product-images";
const REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg";
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const OUTPUT_WIDTH = 1600;
const OUTPUT_HEIGHT = 1600;
const PRODUCT_SCALE_RATIO = 0.72;
const SHADOW_BLUR = 22;
const SHADOW_OPACITY = 0.35;
const SHADOW_Y_OFFSET = 28;

type RemoveBgErrorPayload = {
  errors?: Array<{ title?: string; detail?: string; code?: string }>;
};

const buildSafeFilename = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "product";

const parseImageUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
};

const isDisallowedHost = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "localhost" || normalized.endsWith(".local")) return true;
  if (normalized === "127.0.0.1" || normalized === "::1") return true;
  if (
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalized) ||
    /^169\.254\./.test(normalized)
  ) {
    return true;
  }
  return false;
};

const readRemoveBgError = async (res: Response) => {
  const fallback = `Background removal failed (${res.status}).`;
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = (await res.json().catch(() => null)) as RemoveBgErrorPayload | null;
    const detail = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title;
    return detail ? `Background removal failed: ${detail}` : fallback;
  }

  const text = await res.text().catch(() => "");
  return text ? `Background removal failed: ${text.slice(0, 180)}` : fallback;
};

export async function POST(req: NextRequest) {
  const removeBgApiKey = process.env.REMOVE_BG_API_KEY;
  if (!removeBgApiKey) {
    return NextResponse.json({ ok: false, error: "REMOVE_BG_API_KEY not configured." }, { status: 503 });
  }

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
  const sourceUrl = parseImageUrl(body?.imageUrl);
  if (!sourceUrl) {
    return NextResponse.json({ ok: false, error: "A valid imageUrl is required." }, { status: 400 });
  }
  if (isDisallowedHost(sourceUrl.hostname)) {
    return NextResponse.json({ ok: false, error: "Image URL host is not allowed." }, { status: 400 });
  }

  try {
    const sourceResponse = await fetch(sourceUrl, { cache: "no-store" }).catch(() => null);
    if (!sourceResponse?.ok) {
      return NextResponse.json({ ok: false, error: "Failed to fetch source image." }, { status: 400 });
    }

    const sourceLength = Number(sourceResponse.headers.get("content-length") || 0);
    if (sourceLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ ok: false, error: "Source image is too large (max 8MB)." }, { status: 413 });
    }

    const sourceBytes = await sourceResponse.arrayBuffer();
    if (!sourceBytes.byteLength) {
      return NextResponse.json({ ok: false, error: "Source image is empty." }, { status: 400 });
    }
    if (sourceBytes.byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ ok: false, error: "Source image is too large (max 8MB)." }, { status: 413 });
    }

    const removeBgForm = new FormData();
    removeBgForm.append("image_file", new Blob([sourceBytes]), "product-source.png");
    removeBgForm.append("size", "auto");
    removeBgForm.append("format", "png");

    const removeBgRes = await fetch(REMOVE_BG_ENDPOINT, {
      method: "POST",
      headers: {
        "X-Api-Key": removeBgApiKey,
      },
      body: removeBgForm,
      cache: "no-store",
    }).catch(() => null);

    if (!removeBgRes) {
      return NextResponse.json({ ok: false, error: "Background removal service is unavailable." }, { status: 502 });
    }

    if (!removeBgRes.ok) {
      const message = await readRemoveBgError(removeBgRes);
      const status = removeBgRes.status >= 500 ? 502 : 400;
      return NextResponse.json({ ok: false, error: message }, { status });
    }

    const transparentPng = await removeBgRes.arrayBuffer();
    const productLayer = sharp(Buffer.from(transparentPng));
    const productBounds = await productLayer.metadata();
    if (!productBounds.width || !productBounds.height) {
      return NextResponse.json({ ok: false, error: "Invalid processed image data." }, { status: 500 });
    }

    const maxProductWidth = Math.round(OUTPUT_WIDTH * PRODUCT_SCALE_RATIO);
    const maxProductHeight = Math.round(OUTPUT_HEIGHT * PRODUCT_SCALE_RATIO);
    const resizedProductLayer = await productLayer
      .resize({
        width: maxProductWidth,
        height: maxProductHeight,
        fit: "inside",
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();

    const resizedMeta = await sharp(resizedProductLayer).metadata();
    if (!resizedMeta.width || !resizedMeta.height) {
      return NextResponse.json({ ok: false, error: "Invalid resized image data." }, { status: 500 });
    }

    const productLeft = Math.round((OUTPUT_WIDTH - resizedMeta.width) / 2);
    const productTop = Math.round((OUTPUT_HEIGHT - resizedMeta.height) / 2);
    const shadowTop = Math.min(OUTPUT_HEIGHT - resizedMeta.height, productTop + SHADOW_Y_OFFSET);

    const shadowAlphaMask = await sharp(resizedProductLayer)
      .extractChannel(3)
      .blur(SHADOW_BLUR)
      .linear(SHADOW_OPACITY, 0)
      .toBuffer();

    const shadowLayer = await sharp({
      create: {
        width: resizedMeta.width,
        height: resizedMeta.height,
        channels: 3,
        background: "#000000",
      },
    })
      .joinChannel(shadowAlphaMask)
      .png()
      .toBuffer();

    const finalWhiteBackgroundPng = await sharp({
      create: {
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        channels: 4,
        background: "#ffffff",
      },
    })
      .composite([
        { input: shadowLayer, left: productLeft, top: shadowTop },
        { input: resizedProductLayer, left: productLeft, top: productTop },
      ])
      .png()
      .toBuffer();

    const filePath = `products/${user.id}/bg-removed-${Date.now()}-${buildSafeFilename(sourceUrl.pathname.split("/").pop() || "product")}.png`;
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(filePath, finalWhiteBackgroundPng, {
        upsert: false,
        contentType: "image/png",
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[remove-product-background] upload", uploadError);
      return NextResponse.json({ ok: false, error: "Failed to upload processed image." }, { status: 500 });
    }

    const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(filePath);
    if (!data?.publicUrl) {
      return NextResponse.json({ ok: false, error: "Failed to build processed image URL." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      imageUrl: data.publicUrl,
    });
  } catch (error) {
    console.error("[remove-product-background]", error);
    return NextResponse.json({ ok: false, error: "Failed to process image." }, { status: 500 });
  }
}
