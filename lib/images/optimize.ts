import sharp from "sharp";

export const PRODUCT_IMAGE_MAX_WIDTH = 1200;
export const PRODUCT_IMAGE_MAX_HEIGHT = 1200;
export const PRODUCT_IMAGE_WEBP_QUALITY = 78;

export const optimizeProductImage = async (input: Buffer | Uint8Array | ArrayBuffer) => {
  const buffer = Buffer.isBuffer(input)
    ? input
    : input instanceof ArrayBuffer
      ? Buffer.from(input)
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  return sharp(buffer, { animated: false })
    .rotate()
    .resize({
      width: PRODUCT_IMAGE_MAX_WIDTH,
      height: PRODUCT_IMAGE_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: PRODUCT_IMAGE_WEBP_QUALITY,
      effort: 5,
    })
    .toBuffer();
};
