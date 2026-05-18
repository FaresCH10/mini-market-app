import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type UploadToR2Input = {
  key: string;
  body: Buffer | Uint8Array | ArrayBuffer;
  contentType: string;
  cacheControl?: string;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const trimLeadingSlash = (value: string) => value.replace(/^\/+/, "");

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} is not configured`);
  }
  return value.trim();
};

const getR2Config = () => ({
  bucket: requiredEnv("R2_BUCKET"),
  endpoint: requiredEnv("R2_ENDPOINT"),
  accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
  secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  publicBaseUrl: trimTrailingSlash(requiredEnv("R2_PUBLIC_BASE_URL")),
});

let s3Client: S3Client | null = null;

const getR2Client = () => {
  const config = getR2Config();
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client: s3Client, config };
};

const toBuffer = (body: UploadToR2Input["body"]) => {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
};

export const buildSafeR2Filename = (value: string, fallback = "image") => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
};

export const getR2PublicUrl = (key: string) => {
  const { publicBaseUrl } = getR2Config();
  return `${publicBaseUrl}/${trimLeadingSlash(key)}`;
};

export const uploadToR2 = async ({ key, body, contentType, cacheControl = "public, max-age=31536000, immutable" }: UploadToR2Input) => {
  const { client, config } = getR2Client();
  const normalizedKey = trimLeadingSlash(key);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      Body: toBuffer(body),
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );

  return {
    key: normalizedKey,
    publicUrl: `${config.publicBaseUrl}/${normalizedKey}`,
  };
};
