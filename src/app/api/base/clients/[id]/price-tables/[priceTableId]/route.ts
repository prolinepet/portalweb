import { NextResponse } from "next/server";
import { prisma } from "../../../../../../../lib/prisma";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string; priceTableId: string }> }) {
  const params = await props.params;
  try {
    const clientId = parseId(params.id);
    const priceTableId = parseId(params.priceTableId);
    if (!clientId) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    if (!priceTableId) return NextResponse.json({ error: "priceTableId inválido" }, { status: 400 });

    await prisma.clientPriceTable.delete({
      where: { clientId_priceTableId: { clientId, priceTableId } },
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isNotFound = msg.toLowerCase().includes("record to delete does not exist");
    return NextResponse.json({ error: isNotFound ? "Vínculo não encontrado" : msg }, { status: isNotFound ? 404 : 500 });
  }
}

