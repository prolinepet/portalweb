import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { z } from 'zod';

const ItemSchema = z.object({
  sku: z.string().trim().optional().nullable(),
  name: z.string().trim(),
  unit: z.string().trim().optional().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  discountPct: z.number().optional().nullable(),
  priceTable: z
    .object({
      nrtabpre: z.string().trim(),
      descricao: z.string().trim().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const MirrorOrderSchema = z.object({
  id: z.number().optional().nullable(),
  code: z.string().trim().optional().nullable(),
  orderDate: z.string().trim().optional().nullable(),
  customerName: z.string().trim(),
  customerDoc: z.string().trim().optional().nullable(),
  triangularCustomerName: z.string().trim().optional().nullable(),
  triangularCustomerDoc: z.string().trim().optional().nullable(),
  orderTypeId: z.number().optional().nullable(),
  paymentTerms: z.string().trim().optional().nullable(),
  deliveryDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  entity: z
    .object({
      name: z.string().trim().optional().nullable(),
      cnpj: z.string().trim().optional().nullable(),
    })
    .optional()
    .nullable(),
  logo: z
    .object({
      mime: z.string().trim(),
      base64: z.string().trim(),
    })
    .optional()
    .nullable(),
  thumbs: z
    .array(
      z.object({
        sku: z.string().trim(),
        mime: z.string().trim(),
        base64: z.string().trim(),
      })
    )
    .optional()
    .nullable(),
  items: z.array(ItemSchema).default([]),
});

function toDateBr(input?: string | null): string {
  const s = String(input || '').trim();
  if (!s) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(s);
  if (!Number.isFinite(dt.getTime())) return '';
  return dt.toLocaleDateString('pt-BR');
}

function fmtCurrency(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNumber(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeFileName(name: string): string {
  const s = String(name || '').trim();
  if (!s) return 'espelho-pedido.pdf';
  return s.replace(/[\\/:*?"<>|]+/g, '-');
}

function wrapText(font: any, text: string, size: number, maxWidth: number): string[] {
  const s = String(text || '').trim();
  if (!s) return [''];
  const words = s.split(/\s+/g);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = w;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

type ImageSource = { mime: string; bytes: Uint8Array };

function fitToBox(imgW: number, imgH: number, boxW: number, boxH: number) {
  const w = Number.isFinite(imgW) && imgW > 0 ? imgW : boxW;
  const h = Number.isFinite(imgH) && imgH > 0 ? imgH : boxH;
  const scale = Math.min(boxW / w, boxH / h);
  return { width: w * scale, height: h * scale };
}

async function buildMirrorPdf(
  input: z.infer<typeof MirrorOrderSchema>,
  opts: { orderTypeLabel?: string; logo?: ImageSource | null; thumbsBySku?: Map<string, ImageSource> }
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const headerSize = 16;
  const textSize = 10;
  const smallSize = 9;
  const lineGap = 3;

  const items = Array.isArray(input.items) ? input.items : [];
  const subtotal = items.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.unitPrice || 0)), 0);
  const discount = items.reduce((s, it) => {
    const qty = Number(it.quantity || 0);
    const up = Number(it.unitPrice || 0);
    const dp = Number(it.discountPct || 0);
    const base = qty * up;
    return s + base * (dp / 100);
  }, 0);
  const total = subtotal - discount;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const drawText = (txt: string, x: number, size: number, isBold?: boolean, color?: { r: number; g: number; b: number }) => {
    page.drawText(txt, { x, y, size, font: isBold ? bold : font, color: color ? rgb(color.r, color.g, color.b) : rgb(0, 0, 0) });
  };

  const drawTextAt = (txt: string, x: number, yy: number, size: number, isBold?: boolean, color?: { r: number; g: number; b: number }) => {
    page.drawText(txt, { x, y: yy, size, font: isBold ? bold : font, color: color ? rgb(color.r, color.g, color.b) : rgb(0, 0, 0) });
  };

  const drawKeyValue = (label: string, value: string) => {
    const l = String(label || '').trim();
    const v = String(value || '').trim();
    if (!l && !v) return;
    const labelX = margin;
    const labelW = 88;
    const valueX = labelX + labelW;
    const maxValueW = pageWidth - margin - valueX;
    ensureSpace(textSize + lineGap);
    if (l) {
      drawTextAt(l, labelX, y, textSize, true);
    }
    const lines = wrapText(font, v, textSize, maxValueW);
    if (lines.length > 0) {
      drawTextAt(lines[0], valueX, y, textSize);
      y -= textSize + lineGap;
      for (let i = 1; i < lines.length; i++) {
        ensureSpace(textSize + lineGap);
        drawTextAt(lines[i], valueX, y, textSize);
        y -= textSize + lineGap;
      }
    } else {
      y -= textSize + lineGap;
    }
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  const embeddedLogo =
    opts.logo && opts.logo.bytes && opts.logo.bytes.length > 0
      ? opts.logo.mime.includes('png')
        ? await pdf.embedPng(opts.logo.bytes)
        : await pdf.embedJpg(opts.logo.bytes)
      : null;

  const headerTop = y;
  let headerBlockH = 0;
  if (embeddedLogo) {
    const maxW = 180;
    const maxH = 34;
    const fitted = fitToBox(embeddedLogo.width, embeddedLogo.height, maxW, maxH);
    page.drawImage(embeddedLogo, { x: margin, y: headerTop - fitted.height, width: fitted.width, height: fitted.height });
    headerBlockH = Math.max(headerBlockH, fitted.height);
  } else {
    drawTextAt('Espelho do Pedido', margin, headerTop - headerSize, headerSize, true);
    headerBlockH = Math.max(headerBlockH, headerSize);
  }

  const orderIdPart = input.code ? `Pedido: ${input.code}` : input.id ? `Pedido: ${input.id}` : '';
  const orderDatePart = input.orderDate ? `Data: ${toDateBr(input.orderDate)}` : '';
  const rightLines = [orderIdPart, orderDatePart].filter(Boolean);
  if (rightLines.length > 0) {
    const startY = headerTop - textSize;
    for (let i = 0; i < rightLines.length; i++) {
      const ln = rightLines[i];
      const w = bold.widthOfTextAtSize(ln, textSize);
      drawTextAt(ln, pageWidth - margin - w, startY - (textSize + 2) * i, textSize, true);
      headerBlockH = Math.max(headerBlockH, (textSize + 2) * (i + 1));
    }
  }

  y = headerTop - headerBlockH - 10;
  page.drawLine({ start: { x: margin, y: y }, end: { x: pageWidth - margin, y: y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 12;

  const entityName = String(input.entity?.name || '').trim();
  const entityCnpj = String(input.entity?.cnpj || '').trim();
  if (entityName || entityCnpj) drawKeyValue('Empresa:', [entityName, entityCnpj ? `CNPJ: ${entityCnpj}` : ''].filter(Boolean).join('  •  '));

  const customerDoc = String(input.customerDoc || '').trim();
  drawKeyValue('Cliente:', String(input.customerName || '').trim());
  if (customerDoc) drawKeyValue('Documento:', customerDoc);

  const triName = String(input.triangularCustomerName || '').trim();
  const triDoc = String(input.triangularCustomerDoc || '').trim();
  if (triName || triDoc) {
    drawKeyValue('Triangular:', [triName, triDoc ? `Doc.: ${triDoc}` : ''].filter(Boolean).join('  •  '));
  }

  const delivery = toDateBr(input.deliveryDate);
  const pt = String(input.paymentTerms || '').trim();
  const ot = String(opts.orderTypeLabel || '').trim();
  if (ot) drawKeyValue('Tipo:', ot);
  if (pt) drawKeyValue('Cond. Pagto:', pt);
  if (delivery) drawKeyValue('Entrega:', delivery);

  const notes = String(input.notes || '').trim();
  if (notes) {
    drawKeyValue('Obs.:', notes);
  }

  y -= 6;
  ensureSpace(60);

  const cols = [
    { key: 'photo', label: 'Foto', w: 32, align: 'left' as const },
    { key: 'sku', label: 'SKU', w: 55, align: 'left' as const },
    { key: 'name', label: 'Descrição', w: 180, align: 'left' as const },
    { key: 'unit', label: 'UM', w: 28, align: 'left' as const },
    { key: 'pt', label: 'Tab.', w: 42, align: 'left' as const },
    { key: 'qty', label: 'Qtd', w: 35, align: 'right' as const },
    { key: 'unitPrice', label: 'Preço', w: 55, align: 'right' as const },
    { key: 'disc', label: 'Desc%', w: 40, align: 'right' as const },
    { key: 'total', label: 'Total', w: 48, align: 'right' as const },
  ];
  const tableX = margin;
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const headerH = 18;

  const drawTableHeader = () => {
    ensureSpace(headerH + 10);
    const headerTop = y;
    const rectY = headerTop - headerH;
    page.drawRectangle({
      x: tableX,
      y: rectY,
      width: tableW,
      height: headerH,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
    });
    const baselineY = headerTop - smallSize - 4;
    let x = tableX;
    for (const c of cols) {
      const t = String(c.label || '');
      const w = bold.widthOfTextAtSize(t, smallSize);
      const dx =
        c.key === 'photo'
          ? Math.max(0, (c.w - w) / 2)
          : c.align === 'right'
          ? Math.max(0, c.w - 6 - w)
          : 0;
      drawTextAt(t, x + 4 + dx, baselineY, smallSize, true, { r: 0.2, g: 0.2, b: 0.2 });
      x += c.w;
    }
    y = rectY - 10;
  };

  drawTableHeader();

  const embeddedThumbs = new Map<string, any>();

  for (const it of items) {
    const sku = String(it.sku || '').trim() || '-';
    const name = String(it.name || '').trim() || '-';
    const unit = String(it.unit || '').trim() || '-';
    const ptLabel = String(it.priceTable?.nrtabpre || '').trim() || '-';
    const qty = Number(it.quantity || 0);
    const unitPrice = Number(it.unitPrice || 0);
    const discPct = Number(it.discountPct || 0);
    const lineBase = qty * unitPrice;
    const lineTotal = lineBase - (lineBase * (discPct / 100));

    const nameLines = wrapText(font, name, smallSize, cols.find((c) => c.key === 'name')!.w - 8);
    const rowH = Math.max(34, nameLines.length * (smallSize + 2) + 10);
    ensureSpace(rowH + 6);
    if (y - rowH < margin) {
      newPage();
      drawTableHeader();
    }

    const rowTop = y;
    const rowBottom = rowTop - rowH;
    page.drawRectangle({ x: tableX, y: rowBottom, width: tableW, height: rowH, borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1 });

    let x = tableX;
    const cellBaselineY = rowTop - smallSize - 4;
    const writeCell = (text: string, cW: number, align: 'left' | 'right') => {
      const t = String(text || '');
      const w = font.widthOfTextAtSize(t, smallSize);
      const dx = align === 'right' ? Math.max(0, cW - 6 - w) : 0;
      drawTextAt(t, x + 4 + dx, cellBaselineY, smallSize);
    };

    const rawSku = String(it.sku || '').trim();
    const thumbSrc = rawSku ? opts.thumbsBySku?.get(rawSku) : undefined;
    if (thumbSrc && thumbSrc.bytes && thumbSrc.bytes.length > 0) {
      let img = embeddedThumbs.get(rawSku);
      if (!img) {
        img = thumbSrc.mime.includes('png') ? await pdf.embedPng(thumbSrc.bytes) : await pdf.embedJpg(thumbSrc.bytes);
        embeddedThumbs.set(rawSku, img);
      }
      const innerW = cols[0].w - 8;
      const innerH = rowH - 8;
      const fitted = fitToBox(img.width, img.height, innerW, innerH);
      const imgX = x + 4 + (innerW - fitted.width) / 2;
      const imgY = rowBottom + (rowH - fitted.height) / 2;
      page.drawImage(img, { x: imgX, y: imgY, width: fitted.width, height: fitted.height });
    }
    x += cols[0].w;

    writeCell(sku, cols[1].w, cols[1].align);
    x += cols[1].w;

    for (let i = 0; i < nameLines.length; i++) {
      const ln = nameLines[i];
      const baseY = rowTop - smallSize - 4 - (smallSize + 2) * i;
      drawTextAt(ln, x + 4, baseY, smallSize);
    }
    x += cols[2].w;

    writeCell(unit, cols[3].w, cols[3].align);
    x += cols[3].w;

    writeCell(ptLabel, cols[4].w, cols[4].align);
    x += cols[4].w;

    writeCell(String(Math.round(qty * 1000) / 1000).replace('.', ','), cols[5].w, cols[5].align);
    x += cols[5].w;

    writeCell(fmtNumber(unitPrice), cols[6].w, cols[6].align);
    x += cols[6].w;

    writeCell(fmtNumber(discPct), cols[7].w, cols[7].align);
    x += cols[7].w;

    writeCell(fmtNumber(lineTotal), cols[8].w, cols[8].align);

    y = rowBottom - 6;
  }

  ensureSpace(70);
  y -= 8;
  const totalsX = tableX + tableW - 220;
  const drawTotalLine = (label: string, value: string) => {
    drawText(label, totalsX, textSize, true);
    const valueW = font.widthOfTextAtSize(value, textSize);
    drawText(value, tableX + tableW - valueW, textSize, false);
    y -= textSize + lineGap;
  };

  drawTotalLine('Subtotal:', fmtCurrency(subtotal));
  drawTotalLine('Descontos:', fmtCurrency(discount));
  drawTotalLine('Total:', fmtCurrency(total));

  const pdfBytes = await pdf.save();
  return pdfBytes;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = await request.json().catch(() => null);
    const parsed = MirrorOrderSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });

    const data = parsed.data;
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) return NextResponse.json({ error: 'Informe pelo menos 1 item para gerar o PDF.' }, { status: 400 });

    let orderTypeLabel = '';
    const orderTypeId = data.orderTypeId != null ? Number(data.orderTypeId) : null;
    if (orderTypeId && Number.isFinite(orderTypeId) && orderTypeId > 0) {
      const ot = await prisma.orderType.findUnique({
        where: { id: Math.trunc(orderTypeId) },
        select: { descricao: true, codtipoped: true },
      });
      const desc = String((ot as any)?.descricao || '').trim();
      const code = Number((ot as any)?.codtipoped);
      if (desc && Number.isFinite(code) && code > 0) orderTypeLabel = `${code} - ${desc}`;
      else if (desc) orderTypeLabel = desc;
    }

    const thumbsBySku = new Map<string, ImageSource>();
    const incomingThumbs = Array.isArray((data as any)?.thumbs) ? ((data as any).thumbs as any[]) : [];
    for (const t of incomingThumbs) {
      const sku = String(t?.sku || '').trim();
      const mime = String(t?.mime || '').trim().toLowerCase();
      const b64 = String(t?.base64 || '').trim();
      if (!sku || !mime || !b64) continue;
      if (!(mime.includes('png') || mime.includes('jpeg') || mime.includes('jpg'))) continue;
      try {
        const bytes = Buffer.from(b64, 'base64');
        if (bytes.length > 0) thumbsBySku.set(sku, { mime, bytes });
      } catch {}
    }

    if (thumbsBySku.size === 0) {
      const rawSkus = items.map((it) => String((it as any)?.sku || '').trim()).filter(Boolean);
      const skuSet = Array.from(new Set(rawSkus));
      if (skuSet.length > 0) {
        const dbItems = await prisma.inventoryItem.findMany({
          where: { sku: { in: skuSet } },
          select: { sku: true, thumbnailMime: true, thumbnailBase64: true },
        });
        for (const row of dbItems as any[]) {
          const sku = String(row?.sku || '').trim();
          const mime = String(row?.thumbnailMime || '').trim().toLowerCase();
          const b64 = String(row?.thumbnailBase64 || '').trim();
          if (!sku || !mime || !b64) continue;
          if (!(mime.includes('png') || mime.includes('jpeg') || mime.includes('jpg'))) continue;
          try {
            const bytes = Buffer.from(b64, 'base64');
            if (bytes.length > 0) thumbsBySku.set(sku, { mime, bytes });
          } catch {}
        }
      }
    }

    let logo: ImageSource | null = null;
    const rawLogoMime = (data as any)?.logo?.mime != null ? String((data as any).logo.mime || '').trim() : '';
    const rawLogoB64 = (data as any)?.logo?.base64 != null ? String((data as any).logo.base64 || '').trim() : '';
    if (rawLogoMime && rawLogoB64) {
      const mime = rawLogoMime.toLowerCase();
      if (mime.includes('png') || mime.includes('jpeg') || mime.includes('jpg')) {
        try {
          const bytes = Buffer.from(rawLogoB64, 'base64');
          if (bytes.length > 0) logo = { mime, bytes };
        } catch {}
      }
    }

    const bytes = await buildMirrorPdf(data, { orderTypeLabel, logo, thumbsBySku });
    const idPart = data.code ? String(data.code).trim() : data.id ? String(data.id) : '';
    const fileName = safeFileName(`espelho-pedido${idPart ? `-${idPart}` : ''}.pdf`);

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Erro ao gerar PDF do espelho do pedido:', error);
    return NextResponse.json({ error: 'Erro ao gerar PDF' }, { status: 500 });
  }
}
