import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { includesSearchText } from '../../../../lib/text-search';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const items = await prisma.standardOccurrence.findMany({
      orderBy: { description: 'asc' },
      select: { id: true, description: true },
    });
    return NextResponse.json(q ? items.filter((item) => includesSearchText(item.description, q)) : items);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const description = String(body.description || '').trim();
    if (!description) return NextResponse.json({ error: 'Descrição é obrigatória' }, { status: 400 });
    const created = await prisma.standardOccurrence.create({
      data: { description },
      select: { id: true, description: true },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
