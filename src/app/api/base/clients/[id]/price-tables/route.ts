import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const clientId = parseId(params.id);
    if (!clientId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    const links = await prisma.clientPriceTable.findMany({
      where: { clientId },
      orderBy: [{ priceTable: { descricao: "asc" } }, { priceTable: { nrtabpre: "asc" } }],
      select: {
        priceTable: { select: { id: true, nrtabpre: true, descricao: true, situacao: true } },
      },
    });

    return NextResponse.json(links.map((l) => l.priceTable));
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const clientId = parseId(params.id);
    if (!clientId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const priceTableId = parseId(body?.priceTableId);
    const nrtabpre = typeof body?.nrtabpre === "string" ? String(body.nrtabpre).trim() : "";

    const priceTable =
      priceTableId
        ? await prisma.priceTable.findUnique({ where: { id: priceTableId }, select: { id: true } })
        : nrtabpre
          ? await prisma.priceTable.findFirst({ where: { nrtabpre }, select: { id: true } })
          : null;

    if (!priceTable?.id) return NextResponse.json({ error: "Tabela de preço inválida" }, { status: 400 });

    const existing = await prisma.clientPriceTable.findUnique({
      where: { clientId_priceTableId: { clientId, priceTableId: priceTable.id } },
      select: { id: true },
    });
    if (existing?.id) return NextResponse.json({ ok: true });

    await prisma.clientPriceTable.create({
      data: { clientId, priceTableId: priceTable.id },
      select: { id: true },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isUnique = msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate");
    return NextResponse.json({ error: isUnique ? "Vínculo já existe" : msg }, { status: isUnique ? 409 : 500 });
  }
}
