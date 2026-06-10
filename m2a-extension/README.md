# M2A Integrador — Extensão Chrome

Extensão (Manifest V3) que recebe contratos do sistema Planejamento e os envia
ao portal **precodereferencia.m2atecnologia.com.br** reaproveitando a
sessão logada do operador.

## Como instalar

1. Baixe a pasta `m2a-extension/` deste projeto (ou o ZIP gerado).
2. Abra `chrome://extensions` no Chrome (ou Edge / Brave).
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta da extensão.
5. Faça login no portal M2A em uma aba do navegador.
6. No sistema Planejamento, abra um contrato e clique em **Enviar para M2A**.

## Como funciona

```
Sistema Planejamento (postMessage)
   └─ app_bridge.js (content script)
        └─ background.js (service worker)
             └─ injeta automation_engine.js na aba da M2A
                  └─ fetch() com cookies do usuário → portal M2A
```

- Toda credencial fica **somente** no navegador do operador.
- O sistema Planejamento não armazena senha do portal.
- Cada etapa devolve progresso (`M2A_PROGRESS`) para o app em tempo real.

## Permissões usadas

- `tabs`, `scripting`, `activeTab` — abrir/controlar aba do portal.
- `host_permissions` em `*.m2atecnologia.com.br` — injetar engine.
- `content_scripts` no domínio do sistema Planejamento — receber comandos do app.

## Atualizando os endpoints

Se a M2A alterar URLs/seletores, edite apenas `automation_engine.js`
(função `run()`). Os endpoints atuais seguem o padrão observado no
cliente Python original (`portal_client.py`):

| Etapa             | Endpoint                                                          |
| ----------------- | ----------------------------------------------------------------- |
| Criar contrato    | `/contratacao/.../{processo}/ata_registro_precos/criar_contrato/` |
| Item + dotação    | `/contratos/{id}/contrato_item/incluir_dotacao/`                  |
| Fiscal titular    | `/contratos/{id}/fiscal/`                                         |
| Fiscal substituto | `/contratos/{id}/fiscal_substituto/`                              |
| Gestor            | `/contratos/{id}/gestor/`                                         |
| Preposto          | `/contratos/{id}/preposto/`                                       |
| Documentos        | `/contratos/documentos/` (multipart)                              |
