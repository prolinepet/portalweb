import { prisma } from '../../../../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, props: { params: Promise<{ sku: string }> }) {
  const params = await props.params;
  const raw = params.sku ?? '';
  const sku = decodeURIComponent(raw).trim();
  if (!sku) return new Response('SKU obrigatório', { status: 400 });

  const row = await prisma.inventoryItem.findUnique({
    where: { sku },
    select: { thumbnailMime: true, thumbnailBase64: true },
  });
  if (!row?.thumbnailMime || !row?.thumbnailBase64) return new Response('Not found', { status: 404 });

  const mime = String(row.thumbnailMime || '').trim() || 'image/jpeg';
  const base64 = String(row.thumbnailBase64 || '').trim();
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return new Response('Invalid image', { status: 500 });
  }

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

