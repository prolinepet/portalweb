import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { includesSearchText } from '../../../../lib/text-search';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();

    const rows = await prisma.commercialFamily.findMany({
      orderBy: { description: 'asc' },
      select: { id: true, description: true, erpCode: true, priceBy: true },
    });

    return NextResponse.json(q ? rows.filter((row) => includesSearchText(row.description, q)) : rows);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const description = String(body.description || '').trim();
    const erpCodeRaw = body.erpCode;
    const erpCode = erpCodeRaw === undefined || erpCodeRaw === null ? null : String(erpCodeRaw).trim();
    const priceByRaw = body.priceBy;
    const priceBy = (priceByRaw === undefined || priceByRaw === null ? 'UNIT' : String(priceByRaw).trim().toUpperCase()) || 'UNIT';
    if (!description) return NextResponse.json({ error: 'Descrição é obrigatória' }, { status: 400 });
    if (!['UNIT', 'WEIGHT'].includes(priceBy)) return NextResponse.json({ error: 'Preço Por inválido' }, { status: 400 });

    const created = await prisma.commercialFamily.create({
      data: { description, erpCode, priceBy },
      select: { id: true, description: true, erpCode: true, priceBy: true },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
