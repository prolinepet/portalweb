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

    const links = await prisma.clientOrderType.findMany({
      where: { clientId },
      orderBy: [{ orderType: { descricao: "asc" } }, { orderType: { codtipoped: "asc" } }],
      select: {
        orderType: { select: { id: true, codtipoped: true, descricao: true, situacao: true } },
      },
    });

    return NextResponse.json(links.map((l) => l.orderType));
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
    const orderTypeId = parseId(body?.orderTypeId);
    const codtipoped = parseId(body?.codtipoped);

    const orderType =
      orderTypeId
        ? await prisma.orderType.findUnique({ where: { id: orderTypeId }, select: { id: true } })
        : codtipoped
          ? await prisma.orderType.findFirst({ where: { codtipoped }, select: { id: true } })
          : null;

    if (!orderType?.id) return NextResponse.json({ error: "Tipo de pedido inválido" }, { status: 400 });

    const existing = await prisma.clientOrderType.findUnique({
      where: { clientId_orderTypeId: { clientId, orderTypeId: orderType.id } },
      select: { id: true },
    });
    if (existing?.id) return NextResponse.json({ ok: true });

    await prisma.clientOrderType.create({
      data: { clientId, orderTypeId: orderType.id },
      select: { id: true },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isUnique = msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate");
    return NextResponse.json({ error: isUnique ? "Vínculo já existe" : msg }, { status: isUnique ? 409 : 500 });
  }
}

