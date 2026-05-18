import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
};

loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is not configured`);
  return value.trim();
};

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const SUPABASE_URL = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const R2_BUCKET = requiredEnv("R2_BUCKET");
const R2_ENDPOINT = requiredEnv("R2_ENDPOINT");
const R2_ACCESS_KEY_ID = requiredEnv("R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = requiredEnv("R2_SECRET_ACCESS_KEY");
const R2_PUBLIC_BASE_URL = trimTrailingSlash(requiredEnv("R2_PUBLIC_BASE_URL"));
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const isR2ProductUrl = (value) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return value.startsWith(`${R2_PUBLIC_BASE_URL}/products/`) && url.pathname.includes("/products/");
  } catch {
    return false;
  }
};

const fetchAllR2Products = async () => {
  const products = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, image_url")
      .not("image_url", "is", null)
      .neq("image_url", "")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    products.push(...(data ?? []).filter((product) => isR2ProductUrl(product.image_url)));
    if (!data || data.length < pageSize) break;
  }
  return products;
};

const optimizeImage = async (input) =>
  sharp(input, { animated: false })
    .rotate()
    .resize({
      width: 1200,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 78,
      effort: 5,
    })
    .toBuffer();

const optimizeProduct = async (product) => {
  if (product.image_url.endsWith("/image.webp")) return { status: "skipped" };

  const response = await fetch(product.image_url, { cache: "no-store" });
  if (!response.ok) return { status: "failed", reason: `download ${response.status}` };

  const originalBytes = Buffer.from(await response.arrayBuffer());
  const optimizedBytes = await optimizeImage(originalBytes);
  const key = `products/${product.id}/image.webp`;
  const publicUrl = `${R2_PUBLIC_BASE_URL}/${key}`;

  if (DRY_RUN) {
    return {
      status: "dry-run",
      originalBytes: originalBytes.length,
      optimizedBytes: optimizedBytes.length,
      publicUrl,
    };
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: optimizedBytes,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const { error } = await supabase.from("products").update({ image_url: publicUrl }).eq("id", product.id);
  if (error) throw error;

  return {
    status: "optimized",
    originalBytes: originalBytes.length,
    optimizedBytes: optimizedBytes.length,
    publicUrl,
  };
};

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const main = async () => {
  const products = await fetchAllR2Products();
  let optimized = 0;
  let dryRun = 0;
  let skipped = 0;
  let failed = 0;
  let before = 0;
  let after = 0;

  console.log(`Found ${products.length} R2 product images.`);
  if (DRY_RUN) console.log("DRY_RUN is enabled; no R2 uploads or DB updates will be made.");

  for (const product of products) {
    try {
      const result = await optimizeProduct(product);
      if (result.status === "optimized" || result.status === "dry-run") {
        before += result.originalBytes;
        after += result.optimizedBytes;
        if (result.status === "optimized") optimized += 1;
        if (result.status === "dry-run") dryRun += 1;
        console.log(
          `${result.status} ${product.id} ${product.name}: ${formatMb(result.originalBytes)} -> ${formatMb(result.optimizedBytes)} ${result.publicUrl}`,
        );
      } else if (result.status === "skipped") {
        skipped += 1;
      } else {
        failed += 1;
        console.error(`failed ${product.id} ${product.name}: ${result.reason}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`failed ${product.id} ${product.name}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`Done. optimized=${optimized} dryRun=${dryRun} skipped=${skipped} failed=${failed}`);
  if (before > 0) {
    const saved = before - after;
    console.log(`Total: ${formatMb(before)} -> ${formatMb(after)} saved=${formatMb(saved)} (${Math.round((saved / before) * 100)}%)`);
  }
  if (failed > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
