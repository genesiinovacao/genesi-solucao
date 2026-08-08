# Auditoria de documentação — 08/08/2026

Levantamento do que estava defasado, o que foi corrigido e o que continua em
aberto. Os diagramas dos fluxos estão em [ARQUITETURA.md](ARQUITETURA.md).

| | |
|---|---|
| Commits de funcionalidade sem contrapartida em doc | **42** (12/jul → 08/ago) |
| Documentos revisados | **7** |
| Diagramas criados | **9** |
| Defeitos encontrados | **1** (corrigido) |
| Testes ao final | **139** |

---

## 1. O achado que não era de documentação

> **Defeito · LGPD · corrigido**

A tabela `quotes` guarda uma *cópia* do nome e do telefone do cliente — o
orçamento precisa imprimi-los no papel do balcão. A rotina de anonimização
limpava `customers` e deixava essa cópia intacta.

Na prática: o titular pedia eliminação dos dados, o cadastro era anonimizado,
e o nome dele continuava pesquisável pelo número do orçamento. Pedido atendido
pela metade.

**Origem:** o próprio módulo de orçamento, entregue três commits antes desta
auditoria.

**Correção:** a anonimização limpa as duas tabelas na mesma operação, a
exportação do art. 18 devolve também os orçamentos, e o teste
`Anonymize_AlsoScrubsQuotes` trava a regra.

**Lacuna que permanece:** orçamento de balcão feito sem cadastro guarda nome e
telefone soltos, sem titular em `customers` para pedir a eliminação pela tela.
Fechar isso depende de uma política de retenção, que ainda não existe —
registrado em [LGPD.md §7](LGPD.md).

---

## 2. Estado da documentação antes desta revisão

| Documento | Última rev. | O que estava errado | Agora |
|---|---|---|---|
| `CLAUDE.md` | 11/jul | Dizia "Fases 1–3", 16 controllers, dashboard no Netlify | atualizado |
| `solucao-2026/README.md` | 11/jul | Estrutura listava `database/01…07`; hoje são 19 migrações | atualizado |
| `docs/DEPLOY.md` | 12/jul | Mandava publicar o dashboard no Netlify, abandonado em agosto | atualizado |
| `docs/MANUAL_TECNICO.md` | 11/jul | Sem cobrança, LGPD, impressão térmica ou orçamento | reescrito |
| `docs/LGPD.md` | 25/jul | A tabela `quotes` não estava no mapeamento de dados | atualizado |
| `docs/ARQUITETURA.md` | — | Não existia: nenhum diagrama do sistema em lugar nenhum | criado |
| `docs/manual_do_usuario.md` | 23/mai | Descreve a v1.0 estática, não o produto em produção | marcado histórico |
| `docs/plano_implementacao.md` | 23/mai | Plano original da v1.0, lido como se fosse roadmap | marcado histórico |

Os dois últimos não foram reescritos de propósito. São registro histórico da
v1.0 estática e ganharam aviso no topo, para ninguém seguir instrução que não
vale mais.

---

## 3. O que continua em aberto

| Item | Observação |
|---|---|
| **Manual do usuário do SOLUÇÃO 2026** | O único manual que existe descreve a v1.0 estática. O lojista de hoje não tem documentação. É a maior lacuna. |
| **Política de retenção** | Nada é apagado por idade. Sem ela, o orçamento de balcão sem cadastro fica sem rota de eliminação. |
| **Preços reais dos planos** | `Billing:Plans` ainda com valores placeholder. |
| **Token do Mercado Pago** | PIX segue em modo `simulated`. |
| **NFC-e real** | Provider simulado; falta certificado e homologação. |
| **Documentos jurídicos de LGPD** | Política de privacidade, DPA com Render e GitHub, DPO nomeado. |
| **Numeração de migração colidida** | Dois arquivos `17_`, ambos aplicados em produção. Ficam como estão; próximo número livre é o **20**. |
