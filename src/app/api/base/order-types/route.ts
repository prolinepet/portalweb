import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

function parseKind(raw: unknown): "VENDA" | "BONIFICACAO" | "AMOSTRA" | undefined {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return undefined;
  if (s === "VENDA") return "VENDA";
  if (s === "BONIFICAÇÃO" || s === "BONIFICACAO" || s === "BONIFICACAO ") return "BONIFICACAO";
  if (s === "AMOSTRA") return "AMOSTRA";
  return undefined;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();

    const rows = await prisma.orderType.findMany({
      where: q
        ? {
            OR: [
              { descricao: { contains: q } },
              ...(Number.isFinite(Number(q)) ? [{ codtipoped: Number(q) }] : []),
            ],
          }
        : undefined,
      orderBy: [{ descricao: "asc" }, { codtipoped: "asc" }],
      select: { id: true, codtipoped: true, kind: true, descricao: true, situacao: true },
    });

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const codtipopedRaw = Number(body?.codtipoped);
    const codtipoped = Number.isFinite(codtipopedRaw) ? Math.trunc(codtipopedRaw) : NaN;
    const kind = parseKind(body?.kind);
    const descricao = String(body?.descricao || "").trim();
    const situacaoRaw = Number(body?.situacao);
    const situacao = Number.isFinite(situacaoRaw) ? Math.trunc(situacaoRaw) : 1;

    if (!Number.isFinite(codtipoped) || codtipoped <= 0) return NextResponse.json({ error: "Cód Tipo Ped é obrigatório" }, { status: 400 });
    if (String(codtipoped).length > 6) return NextResponse.json({ error: "Cód Tipo Ped excede 6 dígitos" }, { status: 400 });
    if (!descricao) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
    if (descricao.length > 40) return NextResponse.json({ error: "Descrição excede 40 caracteres" }, { status: 400 });
    if (![1, 2].includes(situacao)) return NextResponse.json({ error: "Situação inválida" }, { status: 400 });

    const created = await prisma.orderType.create({
      data: { codtipoped, kind: kind ?? undefined, descricao, situacao },
      select: { id: true, codtipoped: true, kind: true, descricao: true, situacao: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isUnique = msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate");
    return NextResponse.json({ error: isUnique ? "Cód Tipo Ped já existe" : msg }, { status: isUnique ? 409 : 500 });
  }
}
