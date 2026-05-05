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

async function buildMirrorPdf(input: z.infer<typeof MirrorOrderSchema>, orderTypeLabel?: string) {
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

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  const title = 'Espelho do Pedido';
  drawText(title, margin, headerSize, true);

  const orderIdPart = input.code ? `Pedido: ${input.code}` : input.id ? `Pedido: ${input.id}` : '';
  const orderDatePart = input.orderDate ? `Data: ${toDateBr(input.orderDate)}` : '';
  const rightHeader = [orderIdPart, orderDatePart].filter(Boolean).join('  •  ');
  if (rightHeader) {
    const w = bold.widthOfTextAtSize(rightHeader, textSize);
    drawText(rightHeader, pageWidth - margin - w, textSize, true);
  }

  y -= headerSize + 10;
  page.drawLine({ start: { x: margin, y: y }, end: { x: pageWidth - margin, y: y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 12;

  const entityName = String(input.entity?.name || '').trim();
  const entityCnpj = String(input.entity?.cnpj || '').trim();
  if (entityName || entityCnpj) {
    const line = [entityName, entityCnpj ? `CNPJ: ${entityCnpj}` : ''].filter(Boolean).join('  •  ');
    drawText(line, margin, textSize, true);
    y -= textSize + lineGap;
  }

  const customerDoc = String(input.customerDoc || '').trim();
  drawText(`Cliente: ${String(input.customerName || '').trim()}`, margin, textSize, true);
  y -= textSize + lineGap;
  if (customerDoc) {
    drawText(`Documento: ${customerDoc}`, margin, textSize);
    y -= textSize + lineGap;
  }

  const triName = String(input.triangularCustomerName || '').trim();
  const triDoc = String(input.triangularCustomerDoc || '').trim();
  if (triName || triDoc) {
    const triLine = [triName ? `Remessa Triangular: ${triName}` : '', triDoc ? `Documento: ${triDoc}` : ''].filter(Boolean).join('  •  ');
    drawText(triLine, margin, textSize);
    y -= textSize + lineGap;
  }

  const delivery = toDateBr(input.deliveryDate);
  const pt = String(input.paymentTerms || '').trim();
  const ot = String(orderTypeLabel || '').trim();
  const metaParts = [
    ot ? `Tipo: ${ot}` : '',
    pt ? `Cond. Pagto: ${pt}` : '',
    delivery ? `Entrega: ${delivery}` : '',
  ].filter(Boolean);
  if (metaParts.length > 0) {
    drawText(metaParts.join('  •  '), margin, textSize);
    y -= textSize + lineGap;
  }

  const notes = String(input.notes || '').trim();
  if (notes) {
    const maxW = pageWidth - margin * 2;
    const lines = wrapText(font, `Obs.: ${notes}`, textSize, maxW);
    for (const ln of lines) {
      ensureSpace(textSize + lineGap);
      drawText(ln, margin, textSize);
      y -= textSize + lineGap;
    }
  }

  y -= 6;
  ensureSpace(60);

  const cols = [
    { key: 'sku', label: 'SKU', w: 60, align: 'left' as const },
    { key: 'name', label: 'Descrição', w: 210, align: 'left' as const },
    { key: 'unit', label: 'UM', w: 30, align: 'left' as const },
    { key: 'pt', label: 'Tab.', w: 40, align: 'left' as const },
    { key: 'qty', label: 'Qtd', w: 40, align: 'right' as const },
    { key: 'unitPrice', label: 'Preço', w: 60, align: 'right' as const },
    { key: 'disc', label: 'Desc%', w: 40, align: 'right' as const },
    { key: 'total', label: 'Total', w: 60, align: 'right' as const },
  ];
  const tableX = margin;
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const headerH = 18;

  const drawTableHeader = () => {
    ensureSpace(headerH + 8);
    page.drawRectangle({ x: tableX, y: y - headerH + 4, width: tableW, height: headerH, color: rgb(0.96, 0.96, 0.96), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1 });
    let x = tableX;
    for (const c of cols) {
      drawText(c.label, x + 4, smallSize, true, { r: 0.2, g: 0.2, b: 0.2 });
      x += c.w;
    }
    y -= headerH + 8;
  };

  drawTableHeader();

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
    const rowH = Math.max(14, nameLines.length * (smallSize + 2) + 4);
    ensureSpace(rowH + 6);
    if (y - rowH < margin) {
      newPage();
      drawTableHeader();
    }

    page.drawRectangle({ x: tableX, y: y - rowH + 4, width: tableW, height: rowH, borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1 });

    let x = tableX;
    const cellBaselineY = y - smallSize - 2;
    const writeCell = (text: string, cW: number, align: 'left' | 'right') => {
      const t = String(text || '');
      const w = font.widthOfTextAtSize(t, smallSize);
      const dx = align === 'right' ? Math.max(0, cW - 6 - w) : 0;
      drawTextAt(t, x + 4 + dx, cellBaselineY, smallSize);
    };

    writeCell(sku, cols[0].w, cols[0].align);
    x += cols[0].w;

    for (let i = 0; i < nameLines.length; i++) {
      const ln = nameLines[i];
      const baseY = y - smallSize - 2 - (smallSize + 2) * i;
      drawTextAt(ln, x + 4, baseY, smallSize);
    }
    x += cols[1].w;

    writeCell(unit, cols[2].w, cols[2].align);
    x += cols[2].w;

    writeCell(ptLabel, cols[3].w, cols[3].align);
    x += cols[3].w;

    writeCell(String(Math.round(qty * 1000) / 1000).replace('.', ','), cols[4].w, cols[4].align);
    x += cols[4].w;

    writeCell(fmtNumber(unitPrice), cols[5].w, cols[5].align);
    x += cols[5].w;

    writeCell(fmtNumber(discPct), cols[6].w, cols[6].align);
    x += cols[6].w;

    writeCell(fmtNumber(lineTotal), cols[7].w, cols[7].align);

    y -= rowH + 6;
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

    const bytes = await buildMirrorPdf(data, orderTypeLabel);
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
