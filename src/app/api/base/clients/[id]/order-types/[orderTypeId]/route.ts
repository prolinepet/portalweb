import { NextResponse } from "next/server";
import { prisma } from "../../../../../../../lib/prisma";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string; orderTypeId: string }> }) {
  const params = await props.params;
  try {
    const clientId = parseId(params.id);
    const orderTypeId = parseId(params.orderTypeId);
    if (!clientId) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    if (!orderTypeId) return NextResponse.json({ error: "orderTypeId inválido" }, { status: 400 });

    await prisma.clientOrderType.deleteMany({ where: { clientId, orderTypeId } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

