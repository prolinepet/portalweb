import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/prisma";
import {
  calculateDefaultFinancialTitleDueDate,
  ensureFinancialTitleTable,
} from "../../../../../../lib/financial-titles";

function translateErrorSubType(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SUCESS" || normalized === "SUCCESS") return "SUCESSO";
  if (normalized === "ERROR") return "ERRO";
  if (normalized === "INFORMATION" || normalized === "INFO") return "INFORMAÇÃO";
  if (normalized === "WARNING" || normalized === "WARN") return "AVISO";
  return normalized || "ERRO";
}

function collectErrorSubTypes(data: any): string[] {
  const subTypes: string[] = [];

  const pushFrom = (item: any) => {
    if (!item || typeof item !== "object") return;
    const subType = String(item?.ErrorSubType || "")
      .trim()
      .toUpperCase();
    if (subType) subTypes.push(subType);
  };

  if (Array.isArray(data)) {
    for (const item of data) pushFrom(item);
    return subTypes;
  }

  pushFrom(data);
  if (Array.isArray(data?.RowErrors)) {
    for (const item of data.RowErrors) pushFrom(item);
  }

  return subTypes;
}

function extractMessages(data: any): string[] {
  const messages: string[] = [];

  const pushFrom = (item: any) => {
    if (!item || typeof item !== "object") return;
    const label = translateErrorSubType(item?.ErrorSubType);
    const description = String(item?.ErrorDescription || "").trim();
    if (label || description) {
      messages.push(`${label}: ${description || "-"}`);
    }
  };

  if (Array.isArray(data)) {
    for (const item of data) pushFrom(item);
    return messages;
  }

  pushFrom(data);
  if (Array.isArray(data?.RowErrors)) {
    for (const item of data.RowErrors) pushFrom(item);
  }

  return messages;
}

function parseId(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function formatIsoDate(value: Date) {
  return value.toISOString().split("T")[0];
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    await ensureFinancialTitleTable();

    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = parseId(params.id);
    if (!id) {
      return NextResponse.json({ error: "Id inválido" }, { status: 400 });
    }

    let resource = "insereTituloFinanceiro";
    try {
      const body = await request.json();
      if (body && typeof body === "object" && (body as any).resource) {
        resource = String((body as any).resource || "").trim() || "insereTituloFinanceiro";
      }
    } catch {
      // Body may be empty.
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { erpIntegrationMode: true },
    });
    const integrationRoute = user?.erpIntegrationMode === "PROD" ? "prd" : "tst";

    const financialTitle = await prisma.financialTitle.findUnique({
      where: { id },
      include: {
        entity: { select: { id: true, name: true, cnpj: true } },
        createdByUser: { select: { id: true, name: true, doc: true } },
        reimbursementType: { select: { id: true, description: true } },
      },
    });

    if (!financialTitle) {
      return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
    }

    const sessionEntityIdRaw = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    const sessionEntityId = sessionEntityIdRaw == null ? null : Number(sessionEntityIdRaw);
    if (
      sessionEntityId &&
      Number.isFinite(sessionEntityId) &&
      sessionEntityId > 0 &&
      Math.trunc(sessionEntityId) !== Number(financialTitle.entityId)
    ) {
      return NextResponse.json({ error: "Título não pertence à entidade ativa" }, { status: 403 });
    }

    const entityDoc = String(financialTitle.entity?.cnpj || "").replace(/\D/g, "");
    if (!entityDoc) {
      return NextResponse.json({ error: "CNPJ da entidade não encontrado para integração." }, { status: 400 });
    }

    const createdByDoc = String(financialTitle.createdByUser?.doc || "").replace(/\D/g, "");
    if (!createdByDoc) {
      return NextResponse.json(
        { error: "CPF/CNPJ do usuário que criou o reembolso não foi encontrado." },
        { status: 400 }
      );
    }

    const integrationDueDate = calculateDefaultFinancialTitleDueDate(new Date());

    const payload = {
      route: integrationRoute,
      module: "mpd",
      version: "v1",
      resource,
      method: "POST",
      params: {
        tituloFinanceiro: {
          branchId: "01",
          entityDoc,
          createdByDoc,
          titleId: financialTitle.id,
          numero: financialTitle.numero,
          code: financialTitle.numero,
          kind: financialTitle.kind,
          dueDate: formatIsoDate(integrationDueDate),
          amount: Number(financialTitle.amount || 0),
          status: financialTitle.status,
          description: String(financialTitle.description || financialTitle.reimbursementType?.description || "").trim(),
          reimbursementTypeId: financialTitle.reimbursementTypeId ?? 0,
          reimbursementTypeDescription: String(financialTitle.reimbursementType?.description || "").trim(),
          integrated: financialTitle.integrated ? "S" : "N",
        },
      },
    };

    const erpSetting = await prisma.systemSetting.findUnique({
      where: { key: "erpUrl" },
    });
    const erpUrl = erpSetting?.value || "http://cvserver13:8484";
    const apiUrl = erpUrl.endsWith("/") ? `${erpUrl}apiIntegrTotvsDts/` : `${erpUrl}/apiIntegrTotvsDts/`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      const messages = extractMessages(parsed);
      return NextResponse.json(
        {
          error: `Erro na API externa: ${response.status} - ${text}`,
          messages,
          payloadSent: payload,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const messages = extractMessages(data);
    const subTypes = collectErrorSubTypes(data);
    const hasSuccess = subTypes.some((subType) => subType === "SUCESS" || subType === "SUCCESS");
    const hasError = subTypes.some((subType) => subType === "ERROR" || subType === "ERRO");

    if (hasError || !hasSuccess) {
      return NextResponse.json(
        {
          error: hasError
            ? "Erros retornados pelo ERP na integração do título."
            : "O ERP não confirmou a implantação do título com retorno SUCESS.",
          messages,
          payloadSent: payload,
        },
        { status: 400 }
      );
    }

    await prisma.financialTitle.update({
      where: { id: financialTitle.id },
      data: {
        integrated: true,
        dueDate: integrationDueDate,
      },
    });

    return NextResponse.json({
      ...data,
      integrated: true,
      dueDate: integrationDueDate.toISOString(),
      messages,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
