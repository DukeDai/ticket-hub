import { NextRequest } from 'next/server';
import { withError } from '@/lib/middleware/withError';
import { withAuth } from '@/lib/middleware/withAuth';
import { uploadImage, getUploadUrl } from '@/lib/storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[mime] ?? '';
}

function basename(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '');
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/upload
 *   → returns a presigned PUT URL so the client can upload directly to S3/R2.
 *   Staff/admin only.
 *
 * Query params:
 *   filename   – original filename (used for extension)
 *   contentType – MIME type (e.g. image/jpeg)
 *   expiresIn  – presigned URL expiry in seconds (default 3600, max 86400)
 */
export const GET = withAuth(
  { roles: ['admin', 'staff'] },
  async (req: NextRequest) => {
    const { searchParams } = req.nextUrl;
    const filename = searchParams.get('filename') ?? 'upload';
    const contentType = searchParams.get('contentType') ?? 'image/jpeg';
    const expiresIn = Math.min(
      86400,
      Math.max(300, Number(searchParams.get('expiresIn') ?? 3600))
    );

    if (!ALLOWED_TYPES.has(contentType)) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Unsupported image type. Allowed: jpeg, png, webp, gif.',
          },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { uploadUrl, publicUrl } = await getUploadUrl(
      basename(filename) + extFromMime(contentType),
      contentType,
      expiresIn
    );

    return new Response(
      JSON.stringify({ uploadUrl, publicUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
);

/**
 * POST /api/upload
 *   → accepts multipart form with an image file, uploads to S3/R2, returns URL.
 *   Staff/admin only.
 *
 * Form field: "image" (File in FormData)
 */
export const POST = withAuth(
  { roles: ['admin', 'staff'] },
  async (req: NextRequest) => {
    // Next.js 14 App Router does not natively parse multipart — use Web API.
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid form data' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const imageField = formData.get('image');
    if (!imageField || typeof imageField === 'string') {
      return new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Missing "image" field in form data' },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const file = imageField as File;

    // Content-Type validation
    if (!ALLOWED_TYPES.has(file.type)) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Unsupported image type. Allowed: jpeg, png, webp, gif.',
          },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Size validation (5 MB cap)
    if (file.size > MAX_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Image size exceeds 5 MB limit (got ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
          },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadImage(buffer, file.name, file.type);

    return new Response(
      JSON.stringify({ url }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  }
);
