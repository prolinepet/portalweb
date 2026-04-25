BLOCK-LEVEL ON ERROR UNDO, THROW.

USING OpenEdge.Core.String.
USING OpenEdge.Net.HTTP.ClientBuilder.
USING OpenEdge.Net.HTTP.IHttpClient.
USING OpenEdge.Net.HTTP.IHttpRequest.
USING OpenEdge.Net.HTTP.IHttpResponse.
USING OpenEdge.Net.HTTP.RequestBuilder.
USING Progress.Json.ObjectModel.JsonObject.
USING Progress.Json.ObjectModel.ObjectModelParser.

DEFINE TEMP-TABLE ttApiResultado NO-UNDO
  FIELD batchId      AS CHARACTER
  FIELD rotina       AS CHARACTER
  FIELD chave        AS CHARACTER
  FIELD ok           AS LOGICAL
  FIELD statusCode   AS INTEGER
  FIELD statusReason AS CHARACTER
  FIELD responseBody AS LONGCHAR
  FIELD errorMessage AS LONGCHAR
  INDEX idx1 batchId rotina chave.

DEFINE TEMP-TABLE ttAdministracaoUsuario NO-UNDO
  FIELD id                 AS INTEGER
  FIELD name               AS CHARACTER
  FIELD email              AS CHARACTER
  FIELD doc                AS CHARACTER
  FIELD password           AS CHARACTER
  FIELD salesRepAdmin      AS LOGICAL
  FIELD isSalesAdmin       AS LOGICAL
  FIELD twoFactorRequired  AS LOGICAL
  FIELD erpIntegrationMode AS CHARACTER
  INDEX idx1 id
  INDEX idx2 doc.

DEFINE TEMP-TABLE ttBaseAdmTabelaPreco NO-UNDO
  FIELD id       AS INTEGER
  FIELD nrtabpre AS CHARACTER
  FIELD descricao AS CHARACTER
  FIELD situacao AS INTEGER
  INDEX idx1 id
  INDEX idx2 nrtabpre.

DEFINE TEMP-TABLE ttBaseAdmTipoPedido NO-UNDO
  FIELD id        AS INTEGER
  FIELD codtipoped AS INTEGER
  FIELD descricao AS CHARACTER
  FIELD situacao  AS INTEGER
  INDEX idx1 id
  INDEX idx2 codtipoped.

DEFINE TEMP-TABLE ttBaseCliente NO-UNDO
  FIELD id           AS INTEGER
  FIELD doc          AS CHARACTER
  FIELD name         AS CHARACTER
  FIELD cep          AS CHARACTER
  FIELD logradouro   AS CHARACTER
  FIELD numero       AS CHARACTER
  FIELD bairro       AS CHARACTER
  FIELD cidade       AS CHARACTER
  FIELD estado       AS CHARACTER
  FIELD paymentTermId   AS INTEGER
  FIELD paymentTermCode AS INTEGER
  INDEX idx1 id
  INDEX idx2 doc.

DEFINE TEMP-TABLE ttBaseCondicaoPagamento NO-UNDO
  FIELD id          AS INTEGER
  FIELD code        AS INTEGER
  FIELD description AS CHARACTER
  FIELD installments AS INTEGER
  INDEX idx1 id
  INDEX idx2 code.

DEFINE TEMP-TABLE ttBaseFamiliaComercial NO-UNDO
  FIELD id          AS INTEGER
  FIELD description AS CHARACTER
  FIELD erpCode     AS CHARACTER
  FIELD priceBy     AS CHARACTER
  INDEX idx1 id
  INDEX idx2 erpCode.

DEFINE TEMP-TABLE ttBaseManutencaoItem NO-UNDO
  FIELD id               AS INTEGER
  FIELD name             AS CHARACTER
  FIELD sku              AS CHARACTER
  FIELD unit             AS CHARACTER
  FIELD quantity         AS INTEGER
  FIELD minStock         AS INTEGER
  FIELD width            AS INTEGER
  FIELD length           AS INTEGER
  FIELD grammage         AS INTEGER
  FIELD commercialFamilyId AS INTEGER
  INDEX idx1 id
  INDEX idx2 sku.

FUNCTION fBaseUrl RETURNS CHARACTER () FORWARD.
FUNCTION fApiKey RETURNS CHARACTER () FORWARD.

PROCEDURE pHttpJson PRIVATE:
  DEFINE INPUT  PARAMETER pcMethod   AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER pcUrl      AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER plcBody    AS LONGCHAR  NO-UNDO.
  DEFINE OUTPUT PARAMETER piStatus   AS INTEGER   NO-UNDO.
  DEFINE OUTPUT PARAMETER pcReason   AS CHARACTER NO-UNDO.
  DEFINE OUTPUT PARAMETER plcResp    AS LONGCHAR  NO-UNDO.

  DEFINE VARIABLE oClient      AS IHttpClient  NO-UNDO.
  DEFINE VARIABLE oRequest     AS IHttpRequest NO-UNDO.
  DEFINE VARIABLE oResponse    AS IHttpResponse NO-UNDO.
  DEFINE VARIABLE oRequestBody AS String       NO-UNDO.
  DEFINE VARIABLE oJson        AS JsonObject   NO-UNDO.
  DEFINE VARIABLE cKey         AS CHARACTER    NO-UNDO.

  oRequestBody = NEW String(plcBody).

  CASE CAPS(TRIM(pcMethod)):
    WHEN "POST" THEN
      oRequest = RequestBuilder:Post(pcUrl, oRequestBody):ContentType("application/json"):AcceptJson():Request.
    WHEN "PATCH" THEN
      oRequest = RequestBuilder:Patch(pcUrl, oRequestBody):ContentType("application/json"):AcceptJson():Request.
    WHEN "PUT" THEN
      oRequest = RequestBuilder:Put(pcUrl, oRequestBody):ContentType("application/json"):AcceptJson():Request.
    OTHERWISE
      oRequest = RequestBuilder:Get(pcUrl):AcceptJson():Request.
  END CASE.

  cKey = fApiKey().
  IF cKey <> "" THEN oRequest:SetHeader("x-api-key", cKey).

  oClient = ClientBuilder:Build():Client.
  oResponse = oClient:Execute(oRequest).

  piStatus = oResponse:StatusCode.
  pcReason = oResponse:StatusReason.
  plcResp = "".

  IF VALID-OBJECT(oResponse:Entity) THEN DO:
    IF TYPE-OF(oResponse:Entity, JsonObject) THEN DO:
      oJson = CAST(oResponse:Entity, JsonObject).
      oJson:Write(plcResp, TRUE).
    END.
    ELSE DO:
      plcResp = STRING(oResponse:Entity).
    END.
  END.
END PROCEDURE.

PROCEDURE pAddResultado PRIVATE:
  DEFINE INPUT PARAMETER pcBatchId AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcRotina  AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcChave   AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER plOk      AS LOGICAL   NO-UNDO.
  DEFINE INPUT PARAMETER piStatus  AS INTEGER   NO-UNDO.
  DEFINE INPUT PARAMETER pcReason  AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER plcResp   AS LONGCHAR  NO-UNDO.
  DEFINE INPUT PARAMETER plcErr    AS LONGCHAR  NO-UNDO.

  CREATE ttApiResultado.
  ASSIGN
    ttApiResultado.batchId      = pcBatchId
    ttApiResultado.rotina       = pcRotina
    ttApiResultado.chave        = pcChave
    ttApiResultado.ok           = plOk
    ttApiResultado.statusCode   = piStatus
    ttApiResultado.statusReason = pcReason
    ttApiResultado.responseBody = plcResp
    ttApiResultado.errorMessage = plcErr.
END PROCEDURE.

PROCEDURE administracao_usuario:
  DEFINE INPUT  PARAMETER pcBatchId AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER TABLE FOR ttAdministracaoUsuario.
  DEFINE OUTPUT PARAMETER TABLE FOR ttApiResultado.

  DEFINE VARIABLE oBody   AS JsonObject NO-UNDO.
  DEFINE VARIABLE cUrl    AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE iStatus AS INTEGER    NO-UNDO.
  DEFINE VARIABLE cReason AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE lcResp  AS LONGCHAR   NO-UNDO.
  DEFINE VARIABLE lcErr   AS LONGCHAR   NO-UNDO.
  DEFINE VARIABLE cKey    AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE cMethod AS CHARACTER  NO-UNDO.

  FOR EACH ttAdministracaoUsuario:
    oBody = NEW JsonObject().
    cUrl = fBaseUrl() + "/api/users".
    cMethod = "".
    lcErr = "".

    IF ttAdministracaoUsuario.id > 0 AND ttAdministracaoUsuario.password = "" THEN DO:
      cMethod = "PATCH".
      oBody:Add("id", ttAdministracaoUsuario.id).
      IF ttAdministracaoUsuario.name <> "" THEN oBody:Add("name", ttAdministracaoUsuario.name).
      IF ttAdministracaoUsuario.email <> "" THEN oBody:Add("email", ttAdministracaoUsuario.email).
      IF ttAdministracaoUsuario.doc <> "" THEN oBody:Add("doc", ttAdministracaoUsuario.doc).
      IF ttAdministracaoUsuario.erpIntegrationMode <> "" THEN oBody:Add("erpIntegrationMode", ttAdministracaoUsuario.erpIntegrationMode).
      oBody:Add("salesRepAdmin", ttAdministracaoUsuario.salesRepAdmin).
      oBody:Add("isSalesAdmin", ttAdministracaoUsuario.isSalesAdmin).
      oBody:Add("twoFactorRequired", ttAdministracaoUsuario.twoFactorRequired).
    END.
    ELSE DO:
      cMethod = "POST".
      IF ttAdministracaoUsuario.name <> "" THEN oBody:Add("name", ttAdministracaoUsuario.name).
      IF ttAdministracaoUsuario.email <> "" THEN oBody:Add("email", ttAdministracaoUsuario.email).
      IF ttAdministracaoUsuario.doc <> "" THEN oBody:Add("doc", ttAdministracaoUsuario.doc).
      IF ttAdministracaoUsuario.password <> "" THEN oBody:Add("password", ttAdministracaoUsuario.password).
      IF ttAdministracaoUsuario.erpIntegrationMode <> "" THEN oBody:Add("erpIntegrationMode", ttAdministracaoUsuario.erpIntegrationMode).
      oBody:Add("salesRepAdmin", ttAdministracaoUsuario.salesRepAdmin).
    END.

    RUN pHttpJson (cMethod, cUrl, oBody:GetJsonText(), OUTPUT iStatus, OUTPUT cReason, OUTPUT lcResp).
    IF iStatus >= 200 AND iStatus < 300 THEN
      RUN pAddResultado (pcBatchId, "administracao/usuario", (IF ttAdministracaoUsuario.id > 0 THEN STRING(ttAdministracaoUsuario.id) ELSE ttAdministracaoUsuario.doc), TRUE, iStatus, cReason, lcResp, "").
    ELSE DO:
      lcErr = lcResp.
      RUN pAddResultado (pcBatchId, "administracao/usuario", (IF ttAdministracaoUsuario.id > 0 THEN STRING(ttAdministracaoUsuario.id) ELSE ttAdministracaoUsuario.doc), FALSE, iStatus, cReason, lcResp, lcErr).
    END.
  END.
END PROCEDURE.

PROCEDURE base_administracao_tabela_preco:
  DEFINE INPUT  PARAMETER pcBatchId AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER TABLE FOR ttBaseAdmTabelaPreco.
  DEFINE OUTPUT PARAMETER TABLE FOR ttApiResultado.

  DEFINE VARIABLE oBody   AS JsonObject NO-UNDO.
  DEFINE VARIABLE cUrl    AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE iStatus AS INTEGER    NO-UNDO.
  DEFINE VARIABLE cReason AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE lcResp  AS LONGCHAR   NO-UNDO.
  DEFINE VARIABLE cMethod AS CHARACTER  NO-UNDO.

  FOR EACH ttBaseAdmTabelaPreco:
    oBody = NEW JsonObject().
    IF ttBaseAdmTabelaPreco.id > 0 THEN DO:
      cMethod = "PATCH".
      cUrl = fBaseUrl() + "/api/base/price-tables/" + STRING(ttBaseAdmTabelaPreco.id).
    END.
    ELSE DO:
      cMethod = "POST".
      cUrl = fBaseUrl() + "/api/base/price-tables".
    END.

    IF ttBaseAdmTabelaPreco.nrtabpre <> "" THEN oBody:Add("nrtabpre", ttBaseAdmTabelaPreco.nrtabpre).
    IF ttBaseAdmTabelaPreco.descricao <> "" THEN oBody:Add("descricao", ttBaseAdmTabelaPreco.descricao).
    IF ttBaseAdmTabelaPreco.situacao <> 0 THEN oBody:Add("situacao", ttBaseAdmTabelaPreco.situacao).

    RUN pHttpJson (cMethod, cUrl, oBody:GetJsonText(), OUTPUT iStatus, OUTPUT cReason, OUTPUT lcResp).
    RUN pAddResultado (
      pcBatchId,
      "base/administracao tabela de preco",
      (IF ttBaseAdmTabelaPreco.id > 0 THEN STRING(ttBaseAdmTabelaPreco.id) ELSE ttBaseAdmTabelaPreco.nrtabpre),
      (iStatus >= 200 AND iStatus < 300),
      iStatus,
      cReason,
      lcResp,
      (IF iStatus >= 200 AND iStatus < 300 THEN "" ELSE lcResp)
    ).
  END.
END PROCEDURE.

PROCEDURE base_administracao_tipo_pedido:
  DEFINE INPUT  PARAMETER pcBatchId AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER TABLE FOR ttBaseAdmTipoPedido.
  DEFINE OUTPUT PARAMETER TABLE FOR ttApiResultado.

  DEFINE VARIABLE oBody   AS JsonObject NO-UNDO.
  DEFINE VARIABLE cUrl    AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE iStatus AS INTEGER    NO-UNDO.
  DEFINE VARIABLE cReason AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE lcResp  AS LONGCHAR   NO-UNDO.
  DEFINE VARIABLE cMethod AS CHARACTER  NO-UNDO.

  FOR EACH ttBaseAdmTipoPedido:
    oBody = NEW JsonObject().
    IF ttBaseAdmTipoPedido.id > 0 THEN DO:
      cMethod = "PATCH".
      cUrl = fBaseUrl() + "/api/base/order-types/" + STRING(ttBaseAdmTipoPedido.id).
    END.
    ELSE DO:
      cMethod = "POST".
      cUrl = fBaseUrl() + "/api/base/order-types".
    END.

    IF ttBaseAdmTipoPedido.codtipoped <> 0 THEN oBody:Add("codtipoped", ttBaseAdmTipoPedido.codtipoped).
    IF ttBaseAdmTipoPedido.descricao <> "" THEN oBody:Add("descricao", ttBaseAdmTipoPedido.descricao).
    IF ttBaseAdmTipoPedido.situacao <> 0 THEN oBody:Add("situacao", ttBaseAdmTipoPedido.situacao).

    RUN pHttpJson (cMethod, cUrl, oBody:GetJsonText(), OUTPUT iStatus, OUTPUT cReason, OUTPUT lcResp).
    RUN pAddResultado (
      pcBatchId,
      "base/administracao tipo de pedido",
      (IF ttBaseAdmTipoPedido.id > 0 THEN STRING(ttBaseAdmTipoPedido.id) ELSE STRING(ttBaseAdmTipoPedido.codtipoped)),
      (iStatus >= 200 AND iStatus < 300),
      iStatus,
      cReason,
      lcResp,
      (IF iStatus >= 200 AND iStatus < 300 THEN "" ELSE lcResp)
    ).
  END.
END PROCEDURE.

PROCEDURE base_cliente:
  DEFINE INPUT  PARAMETER pcBatchId AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER TABLE FOR ttBaseCliente.
  DEFINE OUTPUT PARAMETER TABLE FOR ttApiResultado.

  DEFINE VARIABLE oBody   AS JsonObject NO-UNDO.
  DEFINE VARIABLE cUrl    AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE iStatus AS INTEGER    NO-UNDO.
  DEFINE VARIABLE cReason AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE lcResp  AS LONGCHAR   NO-UNDO.
  DEFINE VARIABLE cMethod AS CHARACTER  NO-UNDO.

  FOR EACH ttBaseCliente:
    oBody = NEW JsonObject().
    IF ttBaseCliente.id > 0 THEN DO:
      cMethod = "PATCH".
      cUrl = fBaseUrl() + "/api/base/clients/" + STRING(ttBaseCliente.id).
    END.
    ELSE DO:
      cMethod = "POST".
      cUrl = fBaseUrl() + "/api/base/clients".
    END.

    IF ttBaseCliente.doc <> "" THEN oBody:Add("doc", ttBaseCliente.doc).
    IF ttBaseCliente.name <> "" THEN oBody:Add("name", ttBaseCliente.name).
    IF ttBaseCliente.cep <> "" THEN oBody:Add("cep", ttBaseCliente.cep).
    IF ttBaseCliente.logradouro <> "" THEN oBody:Add("logradouro", ttBaseCliente.logradouro).
    IF ttBaseCliente.numero <> "" THEN oBody:Add("numero", ttBaseCliente.numero).
    IF ttBaseCliente.bairro <> "" THEN oBody:Add("bairro", ttBaseCliente.bairro).
    IF ttBaseCliente.cidade <> "" THEN oBody:Add("cidade", ttBaseCliente.cidade).
    IF ttBaseCliente.estado <> "" THEN oBody:Add("estado", ttBaseCliente.estado).
    IF ttBaseCliente.paymentTermId > 0 THEN oBody:Add("paymentTermId", ttBaseCliente.paymentTermId).
    IF ttBaseCliente.paymentTermCode > 0 THEN oBody:Add("paymentTermCode", ttBaseCliente.paymentTermCode).

    RUN pHttpJson (cMethod, cUrl, oBody:GetJsonText(), OUTPUT iStatus, OUTPUT cReason, OUTPUT lcResp).
    RUN pAddResultado (
      pcBatchId,
      "base/cliente",
      (IF ttBaseCliente.id > 0 THEN STRING(ttBaseCliente.id) ELSE ttBaseCliente.doc),
      (iStatus >= 200 AND iStatus < 300),
      iStatus,
      cReason,
      lcResp,
      (IF iStatus >= 200 AND iStatus < 300 THEN "" ELSE lcResp)
    ).
  END.
END PROCEDURE.

PROCEDURE base_condicao_pagamento:
  DEFINE INPUT  PARAMETER pcBatchId AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER TABLE FOR ttBaseCondicaoPagamento.
  DEFINE OUTPUT PARAMETER TABLE FOR ttApiResultado.

  DEFINE VARIABLE oBody   AS JsonObject NO-UNDO.
  DEFINE VARIABLE cUrl    AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE iStatus AS INTEGER    NO-UNDO.
  DEFINE VARIABLE cReason AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE lcResp  AS LONGCHAR   NO-UNDO.
  DEFINE VARIABLE cMethod AS CHARACTER  NO-UNDO.

  FOR EACH ttBaseCondicaoPagamento:
    oBody = NEW JsonObject().
    IF ttBaseCondicaoPagamento.id > 0 THEN DO:
      cMethod = "PATCH".
      cUrl = fBaseUrl() + "/api/base/payment-terms/" + STRING(ttBaseCondicaoPagamento.id).
    END.
    ELSE DO:
      cMethod = "POST".
      cUrl = fBaseUrl() + "/api/base/payment-terms".
    END.

    IF ttBaseCondicaoPagamento.code <> 0 THEN oBody:Add("code", ttBaseCondicaoPagamento.code).
    IF ttBaseCondicaoPagamento.description <> "" THEN oBody:Add("description", ttBaseCondicaoPagamento.description).
    IF ttBaseCondicaoPagamento.installments <> 0 THEN oBody:Add("installments", ttBaseCondicaoPagamento.installments).

    RUN pHttpJson (cMethod, cUrl, oBody:GetJsonText(), OUTPUT iStatus, OUTPUT cReason, OUTPUT lcResp).
    RUN pAddResultado (
      pcBatchId,
      "base/condicao de pagamento",
      (IF ttBaseCondicaoPagamento.id > 0 THEN STRING(ttBaseCondicaoPagamento.id) ELSE STRING(ttBaseCondicaoPagamento.code)),
      (iStatus >= 200 AND iStatus < 300),
      iStatus,
      cReason,
      lcResp,
      (IF iStatus >= 200 AND iStatus < 300 THEN "" ELSE lcResp)
    ).
  END.
END PROCEDURE.

PROCEDURE base_familia_comercial:
  DEFINE INPUT  PARAMETER pcBatchId AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER TABLE FOR ttBaseFamiliaComercial.
  DEFINE OUTPUT PARAMETER TABLE FOR ttApiResultado.

  DEFINE VARIABLE oBody   AS JsonObject NO-UNDO.
  DEFINE VARIABLE cUrl    AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE iStatus AS INTEGER    NO-UNDO.
  DEFINE VARIABLE cReason AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE lcResp  AS LONGCHAR   NO-UNDO.
  DEFINE VARIABLE cMethod AS CHARACTER  NO-UNDO.

  FOR EACH ttBaseFamiliaComercial:
    oBody = NEW JsonObject().
    IF ttBaseFamiliaComercial.id > 0 THEN DO:
      cMethod = "PATCH".
      cUrl = fBaseUrl() + "/api/base/commercial-families/" + STRING(ttBaseFamiliaComercial.id).
    END.
    ELSE DO:
      cMethod = "POST".
      cUrl = fBaseUrl() + "/api/base/commercial-families".
    END.

    IF ttBaseFamiliaComercial.description <> "" THEN oBody:Add("description", ttBaseFamiliaComercial.description).
    IF ttBaseFamiliaComercial.erpCode <> "" THEN oBody:Add("erpCode", ttBaseFamiliaComercial.erpCode).
    IF ttBaseFamiliaComercial.priceBy <> "" THEN oBody:Add("priceBy", CAPS(ttBaseFamiliaComercial.priceBy)).

    RUN pHttpJson (cMethod, cUrl, oBody:GetJsonText(), OUTPUT iStatus, OUTPUT cReason, OUTPUT lcResp).
    RUN pAddResultado (
      pcBatchId,
      "base/familia comercial",
      (IF ttBaseFamiliaComercial.id > 0 THEN STRING(ttBaseFamiliaComercial.id) ELSE ttBaseFamiliaComercial.erpCode),
      (iStatus >= 200 AND iStatus < 300),
      iStatus,
      cReason,
      lcResp,
      (IF iStatus >= 200 AND iStatus < 300 THEN "" ELSE lcResp)
    ).
  END.
END PROCEDURE.

PROCEDURE base_manutencao_item:
  DEFINE INPUT  PARAMETER pcBatchId AS CHARACTER NO-UNDO.
  DEFINE INPUT  PARAMETER TABLE FOR ttBaseManutencaoItem.
  DEFINE OUTPUT PARAMETER TABLE FOR ttApiResultado.

  DEFINE VARIABLE oBody   AS JsonObject NO-UNDO.
  DEFINE VARIABLE cUrl    AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE iStatus AS INTEGER    NO-UNDO.
  DEFINE VARIABLE cReason AS CHARACTER  NO-UNDO.
  DEFINE VARIABLE lcResp  AS LONGCHAR   NO-UNDO.
  DEFINE VARIABLE cMethod AS CHARACTER  NO-UNDO.

  FOR EACH ttBaseManutencaoItem:
    oBody = NEW JsonObject().
    IF ttBaseManutencaoItem.id > 0 THEN DO:
      cMethod = "PATCH".
      cUrl = fBaseUrl() + "/api/items/" + STRING(ttBaseManutencaoItem.id).
    END.
    ELSE DO:
      cMethod = "POST".
      cUrl = fBaseUrl() + "/api/items".
    END.

    IF ttBaseManutencaoItem.name <> "" THEN oBody:Add("name", ttBaseManutencaoItem.name).
    IF ttBaseManutencaoItem.sku <> "" THEN oBody:Add("sku", ttBaseManutencaoItem.sku).
    IF ttBaseManutencaoItem.unit <> "" THEN oBody:Add("unit", ttBaseManutencaoItem.unit).
    IF ttBaseManutencaoItem.quantity <> 0 THEN oBody:Add("quantity", ttBaseManutencaoItem.quantity).
    IF ttBaseManutencaoItem.minStock <> 0 THEN oBody:Add("minStock", ttBaseManutencaoItem.minStock).
    IF ttBaseManutencaoItem.width <> 0 THEN oBody:Add("width", ttBaseManutencaoItem.width).
    IF ttBaseManutencaoItem.length <> 0 THEN oBody:Add("length", ttBaseManutencaoItem.length).
    IF ttBaseManutencaoItem.grammage <> 0 THEN oBody:Add("grammage", ttBaseManutencaoItem.grammage).
    IF ttBaseManutencaoItem.commercialFamilyId <> 0 THEN oBody:Add("commercialFamilyId", ttBaseManutencaoItem.commercialFamilyId).

    RUN pHttpJson (cMethod, cUrl, oBody:GetJsonText(), OUTPUT iStatus, OUTPUT cReason, OUTPUT lcResp).
    RUN pAddResultado (
      pcBatchId,
      "base/manutencao de item",
      (IF ttBaseManutencaoItem.id > 0 THEN STRING(ttBaseManutencaoItem.id) ELSE ttBaseManutencaoItem.sku),
      (iStatus >= 200 AND iStatus < 300),
      iStatus,
      cReason,
      lcResp,
      (IF iStatus >= 200 AND iStatus < 300 THEN "" ELSE lcResp)
    ).
  END.
END PROCEDURE.

FUNCTION fBaseUrl RETURNS CHARACTER ():
  DEFINE VARIABLE c AS CHARACTER NO-UNDO.
  c = OS-GETENV("PORTAL_API_BASE_URL").
  IF c = ? OR TRIM(c) = "" THEN c = "http://localhost:3001".
  RETURN RIGHT-TRIM(c, "/").
END FUNCTION.

FUNCTION fApiKey RETURNS CHARACTER ():
  DEFINE VARIABLE c AS CHARACTER NO-UNDO.
  c = OS-GETENV("PORTAL_API_KEY").
  IF c = ? THEN c = "".
  RETURN TRIM(c).
END FUNCTION.

