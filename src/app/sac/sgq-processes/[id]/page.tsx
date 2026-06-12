"use client";

import React, { useMemo } from "react";
import { useParams } from "next/navigation";
import ProcessEditor from "../ProcessEditor";

export default function SacSgqProcessMaintenancePage() {
  const params = useParams();
  const id = useMemo(() => {
    const raw = (params as any)?.id;
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }, [params]);

  if (!id) {
    return <div className="text-sm text-red-600">Processo inválido</div>;
  }

  return <ProcessEditor processId={id} />;
}
