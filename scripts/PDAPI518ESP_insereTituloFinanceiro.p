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

DEFINE TEMP-TABLE ttTituloFinanceiroPortal NO-UNDO SERIALIZE-NAME 'tituloFinanceiro':U
    FIELD cod-estabel                  AS CHARACTER INITIAL ? SERIALIZE-NAME 'branchId':U
    FIELD entityDoc                    AS CHARACTER INITIAL ? SERIALIZE-NAME 'entityDoc':U
    FIELD usuario-doc                  AS CHARACTER INITIAL ? SERIALIZE-NAME 'createdByDoc':U
    FIELD id-titulo                    AS INTEGER   INITIAL ? SERIALIZE-NAME 'titleId':U
    FIELD numero-titulo                AS CHARACTER INITIAL ? SERIALIZE-NAME 'numero':U
    FIELD cod-titulo                   AS CHARACTER INITIAL ? SERIALIZE-NAME 'code':U
    FIELD tipo-titulo                  AS CHARACTER INITIAL ? SERIALIZE-NAME 'kind':U
    FIELD dt-vencimento                AS DATE      INITIAL ? SERIALIZE-NAME 'dueDate':U
    FIELD valor-titulo                 AS DECIMAL   INITIAL ? SERIALIZE-NAME 'amount':U
    FIELD situacao-titulo              AS CHARACTER INITIAL ? SERIALIZE-NAME 'status':U
    FIELD descricao-titulo             AS CHARACTER INITIAL ? SERIALIZE-NAME 'description':U
    FIELD id-tipo-reembolso            AS INTEGER   INITIAL ? SERIALIZE-NAME 'reimbursementTypeId':U
    FIELD desc-tipo-reembolso          AS CHARACTER INITIAL ? SERIALIZE-NAME 'reimbursementTypeDescription':U
    FIELD integrado                    AS CHARACTER INITIAL ? SERIALIZE-NAME 'integrated':U.

DEF BUFFER bfapp-emitente FOR mgcad.emitente.

DEF VAR lOK                  AS LOG               NO-UNDO.
DEF VAR myParser             AS ObjectModelParser NO-UNDO.
DEF VAR oJsonEntity          AS JsonObject        NO-UNDO.
DEF VAR oJsonPayload         AS JsonObject        NO-UNDO.
DEF VAR oJsonParams          AS JsonObject        NO-UNDO.
DEF VAR oJsonTituloFinanc    AS JsonObject        NO-UNDO.

/* 1. Limpar o prefixo !UTF-8! se existir */
IF INDEX(pParam, "!UTF-8!") = 1 THEN
    pParam = SUBSTRING(pParam, 8).

myParser    = NEW ObjectModelParser().
oJsonEntity = CAST(myParser:Parse(pParam), JsonObject).

/* 
   O integrador pode entregar o objeto do título em:
   1) payload.tituloFinanceiro
   2) payload.params.tituloFinanceiro
   3) params.tituloFinanceiro
*/
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

lOK = TEMP-TABLE ttTituloFinanceiroPortal:READ-JSON(
          "longchar",
          oJsonTituloFinanc:GetJsonText(),
          "empty"
      ).

IF NOT lOK THEN DO:
    CREATE RowErrors.
    ASSIGN RowErrors.ErrorSubType     = "ERROR"
           RowErrors.ErrorDescription = "Falha ao desserializar o objeto tituloFinanceiro."
           RowErrors.ErrorNumber      = 0.

    lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).
    RETURN.
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

FIND FIRST bfapp-emitente NO-LOCK
     WHERE bfapp-emitente.cgc = ttTituloFinanceiroPortal.entityDoc
     NO-ERROR.

IF NOT AVAILABLE bfapp-emitente THEN DO:
    CREATE RowErrors.
    ASSIGN RowErrors.ErrorSubType     = "ERROR"
           RowErrors.ErrorDescription = SUBSTITUTE(
               "Emitente não encontrado para o CNPJ &1.",
               ttTituloFinanceiroPortal.entityDoc
           )
           RowErrors.ErrorNumber      = ttTituloFinanceiroPortal.id-titulo.

    lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).
    RETURN.
END.

/* 
   A partir daqui entra a lógica da rotina insereTituloFinanceiro.
   Use os dados abaixo, já desserializados a partir do payload do portal:

   ttTituloFinanceiroPortal.cod-estabel
   ttTituloFinanceiroPortal.entityDoc
   ttTituloFinanceiroPortal.usuario-doc
   ttTituloFinanceiroPortal.id-titulo
   ttTituloFinanceiroPortal.numero-titulo
   ttTituloFinanceiroPortal.cod-titulo
   ttTituloFinanceiroPortal.tipo-titulo
   ttTituloFinanceiroPortal.dt-vencimento
   ttTituloFinanceiroPortal.valor-titulo
   ttTituloFinanceiroPortal.situacao-titulo
   ttTituloFinanceiroPortal.descricao-titulo
   ttTituloFinanceiroPortal.id-tipo-reembolso
   ttTituloFinanceiroPortal.desc-tipo-reembolso
   ttTituloFinanceiroPortal.integrado
*/

/*
CREATE RowErrors.
ASSIGN RowErrors.ErrorSubType     = "INFORMATION"
       RowErrors.ErrorDescription = SUBSTITUTE(
           "Título financeiro: &1 implantado!",
           ttTituloFinanceiroPortal.numero-titulo
       )
       RowErrors.ErrorNumber      = ttTituloFinanceiroPortal.id-titulo.
*/

lOK = TEMP-TABLE RowErrors:WRITE-JSON("longchar", pResult).

OUTPUT TO "c:\temp\presult.txt".
    EXPORT pResult.
OUTPUT CLOSE.
