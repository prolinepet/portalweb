/********************************************************************************
** Copyright DATASUL S.A. (1997)
** Todos os Direitos Reservados.
**
** Este fonte e de propriedade exclusiva da DATASUL, sua reproducao
** parcial ou total por qualquer meio, so podera ser feita mediante
** autorizacao expressa.
*******************************************************************************/
USING Progress.Json.ObjectModel.*.
{include/i-prgvrs.i PDAPI518ESP 2.00.00.006 } /*** "010006" ***/

/* Definição das includes */
{utp/ut-glob.i}
{method/dbotterr.i}
{include/i-epc200.i "PDAPI518ESP"}

DEFINE INPUT  PARAMETER pParam  AS LONGCHAR NO-UNDO.
DEFINE OUTPUT PARAMETER pResult AS LONGCHAR NO-UNDO.

DEF TEMP-TABLE RowErrorsTit NO-UNDO LIKE RowErrors.

DEFINE TEMP-TABLE ttTituloFinanceiroPortal NO-UNDO SERIALIZE-NAME "tituloFinanceiro"
    FIELD cod-estabel                  AS CHARACTER INITIAL ? SERIALIZE-NAME "branchId"
    FIELD entityDoc                    AS CHARACTER INITIAL ? SERIALIZE-NAME "entityDoc"
    FIELD usuario-doc                  AS CHARACTER INITIAL ? SERIALIZE-NAME "createdByDoc"
    FIELD centro-custo                 AS CHARACTER INITIAL ? SERIALIZE-NAME "costCenter"
    FIELD id-titulo                    AS INTEGER   INITIAL ? SERIALIZE-NAME "titleId"
    FIELD numero-titulo                AS CHARACTER INITIAL ? SERIALIZE-NAME "numero"
    FIELD cod-titulo                   AS CHARACTER INITIAL ? SERIALIZE-NAME "code"
    FIELD tipo-titulo                  AS CHARACTER INITIAL ? SERIALIZE-NAME "kind"
    FIELD dt-vencimento                AS DATE      INITIAL ? SERIALIZE-NAME "dueDate"
    FIELD valor-titulo                 AS DECIMAL   INITIAL ? SERIALIZE-NAME "amount"
    FIELD situacao-titulo              AS CHARACTER INITIAL ? SERIALIZE-NAME "status"
    FIELD descricao-titulo             AS CHARACTER INITIAL ? SERIALIZE-NAME "description"
    FIELD id-tipo-reembolso            AS INTEGER   INITIAL ? SERIALIZE-NAME "reimbursementTypeId"
    FIELD desc-tipo-reembolso          AS CHARACTER INITIAL ? SERIALIZE-NAME "reimbursementTypeDescription"
    FIELD integrado                    AS CHARACTER INITIAL ? SERIALIZE-NAME "integrated".

DEFINE TEMP-TABLE ttTituloFinanceiroDespesa NO-UNDO SERIALIZE-NAME "expenseItems"
    FIELD id-titulo-pai                AS INTEGER   INITIAL ?
    FIELD id-despesa                   AS INTEGER   INITIAL ? SERIALIZE-NAME "id"
    FIELD id-tipo-reembolso            AS INTEGER   INITIAL ? SERIALIZE-NAME "reimbursementTypeId"
    FIELD desc-tipo-reembolso          AS CHARACTER INITIAL ? SERIALIZE-NAME "reimbursementTypeDescription"
    FIELD conta-contabil-padrao        AS CHARACTER INITIAL ? SERIALIZE-NAME "defaultAccountingAccount"
    FIELD descricao-despesa            AS CHARACTER INITIAL ? SERIALIZE-NAME "description"
    FIELD valor-despesa                AS DECIMAL   INITIAL ? SERIALIZE-NAME "amount".

DEFINE TEMP-TABLE ttTituloFinanceiroDespesaAnexo NO-UNDO SERIALIZE-NAME "attachments"
    FIELD id-despesa-pai               AS INTEGER   INITIAL ?
    FIELD id-anexo                     AS INTEGER   INITIAL ? SERIALIZE-NAME "id"
    FIELD nome-arquivo-original        AS CHARACTER INITIAL ? SERIALIZE-NAME "originalFileName"
    FIELD tipo-mime                    AS CHARACTER INITIAL ? SERIALIZE-NAME "mimeType"
    FIELD tamanho-bytes                AS INTEGER   INITIAL ? SERIALIZE-NAME "sizeBytes".

DEF BUFFER bfapp-emitente FOR mgcad.emitente.

DEF VAR lOK                  AS LOG               NO-UNDO.
DEF VAR myParser             AS ObjectModelParser NO-UNDO.
DEF VAR oJsonEntity          AS JsonObject        NO-UNDO.
DEF VAR oJsonPayload         AS JsonObject        NO-UNDO.
DEF VAR oJsonParams          AS JsonObject        NO-UNDO.
DEF VAR oJsonTituloFinanc    AS JsonObject        NO-UNDO.
DEF VAR oJsonDespesas        AS JsonArray         NO-UNDO.
DEF VAR oJsonDespesa         AS JsonObject        NO-UNDO.
DEF VAR oJsonAnexos          AS JsonArray         NO-UNDO.
DEF VAR oJsonAnexo           AS JsonObject        NO-UNDO.
DEF VAR cDueDate             AS CHARACTER         NO-UNDO.
DEF VAR iDespesa             AS INTEGER           NO-UNDO.
DEF VAR iAnexo               AS INTEGER           NO-UNDO.
DEF VAR i-cont-mes           AS INTEGER           NO-UNDO.

FUNCTION fParseIsoDate RETURNS DATE (INPUT pcDate AS CHARACTER):
    DEF VAR cDateOnly AS CHARACTER NO-UNDO.
    DEF VAR dValue    AS DATE      NO-UNDO.

    IF pcDate = ? OR TRIM(pcDate) = "" THEN
        RETURN ?.

    cDateOnly = ENTRY(1, TRIM(pcDate), "T").

    IF NUM-ENTRIES(cDateOnly, "-") <> 3 THEN
        RETURN ?.

    ASSIGN dValue = DATE(
                        INTEGER(ENTRY(2, cDateOnly, "-")),
                        INTEGER(ENTRY(3, cDateOnly, "-")),
                        INTEGER(ENTRY(1, cDateOnly, "-"))
                    ) NO-ERROR.

    IF ERROR-STATUS:ERROR THEN
        RETURN ?.

    RETURN dValue.
END FUNCTION.

/* 1. Limpar o prefixo !UTF-8! se existir */
IF INDEX(pParam, "!UTF-8!") = 1 THEN
    pParam = SUBSTRING(pParam, 8).

myParser    = NEW ObjectModelParser().
oJsonEntity = CAST(myParser:Parse(pParam), JsonObject).

oJsonPayload = oJsonEntity:GetJsonObject("payload") NO-ERROR.
IF NOT VALID-OBJECT(oJsonPayload) THEN
    oJsonPayload = oJsonEntity.

IF VALID-OBJECT(oJsonPayload) THEN DO:
    oJsonTituloFinanc = oJsonPayload:GetJsonObject("tituloFinanceiro") NO-ERROR.

    IF NOT VALID-OBJECT(oJsonTituloFinanc) THEN DO:
        oJsonParams = oJsonPayload:GetJsonObject("params") NO-ERROR.
        IF VALID-OBJECT(oJsonParams) THEN
            oJsonTituloFinanc = oJsonParams:GetJsonObject("tituloFinanceiro") NO-ERROR.
    END.
END.

IF NOT VALID-OBJECT(oJsonTituloFinanc) THEN DO:
    CREATE RowErrors.
    ASSIGN RowErrors.ErrorSubType     = "ERROR"
           RowErrors.ErrorDescription = "Objeto tituloFinanceiro não encontrado no payload recebido do portal."
           RowErrors.ErrorNumber      = 0.

    lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).
    RETURN.
END.

EMPTY TEMP-TABLE ttTituloFinanceiroPortal.
EMPTY TEMP-TABLE ttTituloFinanceiroDespesa.
EMPTY TEMP-TABLE ttTituloFinanceiroDespesaAnexo.

CREATE ttTituloFinanceiroPortal.
ASSIGN
    ttTituloFinanceiroPortal.cod-estabel         = oJsonTituloFinanc:GetCharacter("branchId")
    ttTituloFinanceiroPortal.entityDoc           = oJsonTituloFinanc:GetCharacter("entityDoc")
    ttTituloFinanceiroPortal.usuario-doc         = oJsonTituloFinanc:GetCharacter("createdByDoc")
    ttTituloFinanceiroPortal.centro-custo        = oJsonTituloFinanc:GetCharacter("costCenter")
    ttTituloFinanceiroPortal.id-titulo           = oJsonTituloFinanc:GetInteger("titleId")
    ttTituloFinanceiroPortal.numero-titulo       = oJsonTituloFinanc:GetCharacter("numero")
    ttTituloFinanceiroPortal.cod-titulo          = oJsonTituloFinanc:GetCharacter("code")
    ttTituloFinanceiroPortal.tipo-titulo         = oJsonTituloFinanc:GetCharacter("kind")
    ttTituloFinanceiroPortal.valor-titulo        = oJsonTituloFinanc:GetDecimal("amount")
    ttTituloFinanceiroPortal.situacao-titulo     = oJsonTituloFinanc:GetCharacter("status")
    ttTituloFinanceiroPortal.descricao-titulo    = oJsonTituloFinanc:GetCharacter("description")
    ttTituloFinanceiroPortal.id-tipo-reembolso   = oJsonTituloFinanc:GetInteger("reimbursementTypeId")
    ttTituloFinanceiroPortal.desc-tipo-reembolso = oJsonTituloFinanc:GetCharacter("reimbursementTypeDescription")
    ttTituloFinanceiroPortal.integrado           = oJsonTituloFinanc:GetCharacter("integrated")
    NO-ERROR.

ASSIGN cDueDate = oJsonTituloFinanc:GetCharacter("dueDate") NO-ERROR.
ttTituloFinanceiroPortal.dt-vencimento = fParseIsoDate(cDueDate).

oJsonDespesas = oJsonTituloFinanc:GetJsonArray("expenseItems") NO-ERROR.
IF VALID-OBJECT(oJsonDespesas) THEN DO:
    DO iDespesa = 1 TO oJsonDespesas:Length:
        oJsonDespesa = oJsonDespesas:GetJsonObject(iDespesa) NO-ERROR.
        IF NOT VALID-OBJECT(oJsonDespesa) THEN
            NEXT.

        CREATE ttTituloFinanceiroDespesa.
        ASSIGN
            ttTituloFinanceiroDespesa.id-titulo-pai         = ttTituloFinanceiroPortal.id-titulo
            ttTituloFinanceiroDespesa.id-despesa            = oJsonDespesa:GetInteger("id")
            ttTituloFinanceiroDespesa.id-tipo-reembolso     = oJsonDespesa:GetInteger("reimbursementTypeId")
            ttTituloFinanceiroDespesa.desc-tipo-reembolso   = oJsonDespesa:GetCharacter("reimbursementTypeDescription")
            ttTituloFinanceiroDespesa.conta-contabil-padrao = oJsonDespesa:GetCharacter("defaultAccountingAccount")
            ttTituloFinanceiroDespesa.descricao-despesa     = oJsonDespesa:GetCharacter("description")
            ttTituloFinanceiroDespesa.valor-despesa         = oJsonDespesa:GetDecimal("amount")
            NO-ERROR.

        oJsonAnexos = oJsonDespesa:GetJsonArray("attachments") NO-ERROR.
        IF VALID-OBJECT(oJsonAnexos) THEN DO:
            DO iAnexo = 1 TO oJsonAnexos:Length:
                oJsonAnexo = oJsonAnexos:GetJsonObject(iAnexo) NO-ERROR.
                IF NOT VALID-OBJECT(oJsonAnexo) THEN
                    NEXT.

                CREATE ttTituloFinanceiroDespesaAnexo.
                ASSIGN
                    ttTituloFinanceiroDespesaAnexo.id-despesa-pai        = ttTituloFinanceiroDespesa.id-despesa
                    ttTituloFinanceiroDespesaAnexo.id-anexo              = oJsonAnexo:GetInteger("id")
                    ttTituloFinanceiroDespesaAnexo.nome-arquivo-original = oJsonAnexo:GetCharacter("originalFileName")
                    ttTituloFinanceiroDespesaAnexo.tipo-mime             = oJsonAnexo:GetCharacter("mimeType")
                    ttTituloFinanceiroDespesaAnexo.tamanho-bytes         = oJsonAnexo:GetInteger("sizeBytes")
                    NO-ERROR.
            END.
        END.
    END.
END.

FIND FIRST ttTituloFinanceiroPortal NO-LOCK NO-ERROR.

IF NOT AVAILABLE ttTituloFinanceiroPortal THEN DO:
    CREATE RowErrors.
    ASSIGN RowErrors.ErrorSubType     = "ERROR"
           RowErrors.ErrorDescription = "Nenhum título financeiro foi informado na requisição."
           RowErrors.ErrorNumber      = 0.

    lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).
    RETURN.
END.

IF TRIM(ttTituloFinanceiroPortal.cod-estabel) = "" OR
   TRIM(ttTituloFinanceiroPortal.entityDoc) = "" OR
   TRIM(ttTituloFinanceiroPortal.usuario-doc) = "" OR
   TRIM(ttTituloFinanceiroPortal.numero-titulo) = "" OR
   ttTituloFinanceiroPortal.dt-vencimento = ? OR
   ttTituloFinanceiroPortal.valor-titulo = ? THEN DO:
    CREATE RowErrors.
    ASSIGN RowErrors.ErrorSubType     = "ERROR"
           RowErrors.ErrorDescription = "Campos obrigatórios não informados para integração do título financeiro."
           RowErrors.ErrorNumber      = ttTituloFinanceiroPortal.id-titulo.

    lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).
    RETURN.
END.

IF NOT CAN-FIND(FIRST ttTituloFinanceiroDespesa) THEN DO:
    CREATE RowErrors.
    ASSIGN RowErrors.ErrorSubType     = "ERROR"
           RowErrors.ErrorDescription = "Nenhuma despesa foi informada para o título financeiro."
           RowErrors.ErrorNumber      = ttTituloFinanceiroPortal.id-titulo.

    lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).
    RETURN.
END.

FIND FIRST bfapp-emitente NO-LOCK
     WHERE bfapp-emitente.cgc = ttTituloFinanceiroPortal.usuario-doc
     NO-ERROR.

IF NOT AVAILABLE bfapp-emitente THEN DO:
    CREATE RowErrors.
    ASSIGN RowErrors.ErrorSubType     = "ERROR"
           RowErrors.ErrorDescription = SUBSTITUTE("Fornecedor não encontrado para o CPF/CNPJ &1.", ttTituloFinanceiroPortal.usuario-doc)
           RowErrors.ErrorNumber      = ttTituloFinanceiroPortal.id-titulo.
    lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).
    RETURN.
END.

FIND FIRST ttTituloFinanceiroPortal EXCLUSIVE-LOCK NO-ERROR.

ASSIGN i-cont-mes = 0.
FOR EACH tit_ap USE-INDEX titap_id NO-LOCK
   WHERE tit_ap.cod_estab       = "201"
     AND tit_ap.cod_espec_docto = "RD"
     AND tit_ap.cod_ser_docto   = ""
     AND tit_ap.cod_tit_ap     BEGINS STRING(bfapp-emitente.cod-emitente, "999999") + STRING(MONTH(TODAY), "99"):
     ASSIGN i-cont-mes = i-cont-mes + 1.
END.

ASSIGN ttTituloFinanceiroPortal.numero-titulo = STRING(bfapp-emitente.cod-emitente, "999999") + STRING(MONTH(TODAY), "99") + STRING(i-cont-mes + 1, "99").

EMPTY TEMP-TABLE RowErrorsTit.
RUN func/geraTituloFinanceiro.p(
        ttTituloFinanceiroPortal.dt-vencimento,
        ttTituloFinanceiroPortal.numero-titulo,
        "RD",
        ttTituloFinanceiroPortal.valor-titulo,
        ttTituloFinanceiroPortal.usuario-doc,
        INPUT TABLE ttTituloFinanceiroDespesa,
        OUTPUT TABLE RowErrorsTit
    ).

IF NOT CAN-FIND(FIRST RowErrorsTit) THEN DO:
   CREATE RowErrors.
   ASSIGN RowErrors.ErrorSubType     = "SUCESS"
          RowErrors.ErrorDescription = SUBSTITUTE("Título implantado com sucesso: &1.", ttTituloFinanceiroPortal.numero-titulo)
          RowErrors.ErrorNumber      = ttTituloFinanceiroPortal.id-titulo.
END.
ELSE DO:
   FOR EACH RowErrorsTit:
       CREATE RowErrors.
       BUFFER-COPY RowErrorsTit TO RowErrors.
   END.
END.

OUTPUT TO VALUE("c:\temp\ttTituloFinanceiroPortal_" + REPLACE(ttTituloFinanceiroPortal.numero-titulo, "/", "_") + ".txt") NO-CONVERT.
    DISP ttTituloFinanceiroPortal WITH WIDTH 333 1 COL.
    FOR EACH ttTituloFinanceiroDespesa:
        DISP ttTituloFinanceiroDespesa WITH WIDTH 333 1 COL.
    END.
    FOR EACH ttTituloFinanceiroDespesaAnexo:
        DISP ttTituloFinanceiroDespesaAnexo WITH WIDTH 333 1 COL.
    END.
OUTPUT CLOSE.

lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).
OUTPUT TO "c:\temp\retorno_mensagens.txt".
    EXPORT pResult.
OUTPUT CLOSE.
