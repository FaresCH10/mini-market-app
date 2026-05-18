import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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
const trimLeadingSlash = (value) => value.replace(/^\/+/, "");

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

const isAlreadyR2Url = (value) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    const r2Base = new URL(R2_PUBLIC_BASE_URL);
    return url.origin === r2Base.origin && url.pathname.startsWith(`${trimTrailingSlash(r2Base.pathname)}/`);
  } catch {
    return false;
  }
};

const buildSafeFilename = (value, fallback = "image") => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
};

const getExtFromContentType = (contentType) => {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("svg")) return "svg";
  return "jpg";
};

const buildR2Key = (product, imageUrl, contentType) => {
  const url = new URL(imageUrl);
  const pathnameFilename = decodeURIComponent(url.pathname.split("/").pop() || "");
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(pathnameFilename);
  const fallbackExt = getExtFromContentType(contentType);
  const filename = buildSafeFilename(
    hasExt ? pathnameFilename : `${pathnameFilename || product.name || "image"}.${fallbackExt}`,
    `image.${fallbackExt}`,
  );
  return `products/${product.id}/${filename}`;
};

const fetchAllProducts = async () => {
  const products = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("products")
      .select("id, name, image_url")
      .not("image_url", "is", null)
      .neq("image_url", "")
      .range(from, to);

    if (error) throw error;
    products.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return products;
};

const migrateProduct = async (product) => {
  const imageUrl = product.image_url;
  if (isAlreadyR2Url(imageUrl)) return { status: "skipped" };

  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) {
    return { status: "failed", reason: `download ${response.status}` };
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return { status: "failed", reason: `unexpected content-type ${contentType}` };
  }

  const body = Buffer.from(await response.arrayBuffer());
  const key = trimLeadingSlash(buildR2Key(product, imageUrl, contentType));
  const publicUrl = `${R2_PUBLIC_BASE_URL}/${key}`;

  if (DRY_RUN) {
    return { status: "dry-run", publicUrl };
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const { error } = await supabase.from("products").update({ image_url: publicUrl }).eq("id", product.id);
  if (error) throw error;

  return { status: "migrated", publicUrl };
};

const main = async () => {
  const products = await fetchAllProducts();
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let dryRun = 0;

  console.log(`Found ${products.length} products with image_url.`);
  if (DRY_RUN) console.log("DRY_RUN is enabled; no R2 uploads or DB updates will be made.");

  for (const product of products) {
    try {
      const result = await migrateProduct(product);
      if (result.status === "migrated") {
        migrated += 1;
        console.log(`migrated ${product.id} ${product.name}: ${result.publicUrl}`);
      } else if (result.status === "dry-run") {
        dryRun += 1;
        console.log(`dry-run ${product.id} ${product.name}: ${result.publicUrl}`);
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

  console.log(`Done. migrated=${migrated} dryRun=${dryRun} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
