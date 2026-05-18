import sharp from "sharp";
import { optimizeProductImage } from "@/lib/images/optimize";

const REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg";
const OUTPUT_WIDTH = 1600;
const OUTPUT_HEIGHT = 1600;
const PRODUCT_SCALE_RATIO = 0.86;
const SHADOW_BLUR = 22;
const SHADOW_OPACITY = 0.35;
const SHADOW_Y_OFFSET = 28;

type RemoveBgErrorPayload = {
  errors?: Array<{ title?: string; detail?: string; code?: string }>;
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

export const removeBackgroundAndOptimizeProductImage = async (
  input: Buffer | Uint8Array | ArrayBuffer,
  removeBgApiKey: string,
) => {
  const sourceBytes = Buffer.isBuffer(input)
    ? input
    : input instanceof ArrayBuffer
      ? Buffer.from(input)
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  const form = new FormData();
  const sourceArrayBuffer = sourceBytes.buffer.slice(
    sourceBytes.byteOffset,
    sourceBytes.byteOffset + sourceBytes.byteLength,
  ) as ArrayBuffer;
  form.append("image_file", new Blob([sourceArrayBuffer]), "product-source.png");
  form.append("size", "auto");
  form.append("format", "png");

  const removeBgRes = await fetch(REMOVE_BG_ENDPOINT, {
    method: "POST",
    headers: { "X-Api-Key": removeBgApiKey },
    body: form,
    cache: "no-store",
  });

  if (!removeBgRes.ok) {
    throw new Error(await readRemoveBgError(removeBgRes));
  }

  const transparentPng = Buffer.from(await removeBgRes.arrayBuffer());
  const productLayer = sharp(transparentPng);
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
    throw new Error("Invalid processed image data.");
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

  return optimizeProductImage(finalWhiteBackgroundPng);
};
