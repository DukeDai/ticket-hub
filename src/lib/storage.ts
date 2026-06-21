import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ─── Client (singleton) ────────────────────────────────────────────────────

let _client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_client) return _client;

  const endpoint = process.env.S3_ENDPOINT;       // https://<account>.r2.cloudflarestorage.com for R2
  const region = process.env.S3_REGION ?? "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.S3_SECRET_KEY ?? "";

  _client = new S3Client({
    region,
    ...(endpoint
      ? {
          endpoint,
          forcePathStyle: true,        // R2 / MinIO require path-style
          credentials: { accessKeyId, secretAccessKey },
        }
      : { credentials: { accessKeyId, secretAccessKey } }),
  });

  return _client;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET env var is not set");
  return b;
}

/** Strips the bucket prefix off a full s3:// URL so we have just the key */
function parseKey(url: string): string {
  // Handles: https://bucket.r2.cloudflarestorage.com/key  OR  https://s3.amazonaws.com/bucket/key
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").split("/");
    // First segment after removing leading slash is the bucket name
    if (parts[0] === bucket()) return parts.slice(1).join("/");
    return parts.join("/");
  } catch {
    // Fallback: treat everything after the last slash as the key
    return url.replace(/.*\//, "");
  }
}

/** Whether a URL belongs to our bucket — used to guard deleteImage */
function isOurBucket(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes(bucket().toLowerCase());
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a image buffer to S3/R2.
 * Returns the public URL of the uploaded object.
 */
export async function uploadImage(
  file: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const key = `products/${Date.now()}-${filename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: file,
      ContentType: contentType,
      // Make publicly readable
      ACL: "public-read",
    })
  );

  // Build public URL
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    // R2 / custom endpoint
    return `${endpoint.replace(/\/$/, "")}/${bucket()}/${key}`;
  }
  // Standard S3
  return `https://${bucket()}.s3.${process.env.S3_REGION ?? "us-east-1"}.amazonaws.com/${key}`;
}

/**
 * Delete an image from S3/R2.
 * Only deletes URLs that belong to our bucket (safe to call with external URLs).
 */
export async function deleteImage(url: string): Promise<void> {
  if (!isOurBucket(url)) return; // safety: never delete external URLs
  const client = getS3Client();
  const key = parseKey(url);
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: key })
  );
}

/**
 * Generate a presigned PUT URL so a browser can upload directly to S3/R2.
 * Returns both the signed upload URL and the final public URL.
 */
export async function getUploadUrl(
  filename: string,
  contentType: string,
  expiresIn = 3600
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const client = getS3Client();
  const key = `products/${Date.now()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
    ACL: "public-read",
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  const endpoint = process.env.S3_ENDPOINT;
  const publicUrl = endpoint
    ? `${endpoint.replace(/\/$/, "")}/${bucket()}/${key}`
    : `https://${bucket()}.s3.${process.env.S3_REGION ?? "us-east-1"}.amazonaws.com/${key}`;

  return { uploadUrl, publicUrl };
}
