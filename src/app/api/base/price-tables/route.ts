import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();

    const rows = await prisma.priceTable.findMany({
      where: q
        ? {
            OR: [
              { nrtabpre: { contains: q } },
              { descricao: { contains: q } },
            ],
          }
        : undefined,
      orderBy: [{ descricao: "asc" }, { nrtabpre: "asc" }],
      select: { id: true, nrtabpre: true, descricao: true, situacao: true },
    });

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const shouldUnlinkItems = !session;

    const body = await request.json().catch(() => ({}));
    const nrtabpre = String(body?.nrtabpre || "").trim();
    const descricao = String(body?.descricao || "").trim();
    const situacaoRaw = Number(body?.situacao);
    const situacao = Number.isFinite(situacaoRaw) ? Math.trunc(situacaoRaw) : 1;

    if (!nrtabpre) return NextResponse.json({ error: "Cód Tab é obrigatório" }, { status: 400 });
    if (nrtabpre.length > 20) return NextResponse.json({ error: "Cód Tab excede 20 caracteres" }, { status: 400 });
    if (!descricao) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
    if (descricao.length > 40) return NextResponse.json({ error: "Descrição excede 40 caracteres" }, { status: 400 });
    if (![1, 2].includes(situacao)) return NextResponse.json({ error: "Situação inválida" }, { status: 400 });

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.priceTable.create({
        data: { nrtabpre, descricao, situacao },
        select: { id: true, nrtabpre: true, descricao: true, situacao: true },
      });
      if (shouldUnlinkItems) {
        await tx.priceTableItem.deleteMany({ where: { priceTableId: row.id } });
      }
      return row;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isUnique = msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate");
    return NextResponse.json({ error: isUnique ? "Cód Tab já existe" : msg }, { status: isUnique ? 409 : 500 });
  }
}
