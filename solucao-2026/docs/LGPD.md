# LGPD — mapeamento de dados e conformidade técnica

> Documento técnico para orientar a adequação jurídica. **Não substitui parecer
> de advogado.** Última revisão: **08/08/2026**.
>
> Diagrama de onde os dados pessoais moram:
> [ARQUITETURA.md §9](ARQUITETURA.md).

## 1. Papéis

| Papel | Quem | O quê |
|---|---|---|
| **Controlador** | O lojista (cada tenant) | Decide coletar CPF, telefone e endereço dos seus consumidores |
| **Operador** | Genesi (SOLUÇÃO 2026) | Trata os dados em nome do lojista, conforme o contrato |
| **Titular** | Consumidor final e funcionários da loja | Pessoa a quem os dados se referem |

Consequência prática: **o contrato com cada lojista precisa de cláusula de
tratamento de dados** definindo finalidade, responsabilidades e o dever do
operador de seguir instruções do controlador. Sem isso, numa fiscalização a
responsabilidade tende a recair sobre o operador.

## 2. Dados pessoais tratados

| Tabela | Campos pessoais | Titular | Base legal típica |
|---|---|---|---|
| `customers` | nome, `tax_id` (CPF), e-mail, telefone, endereço, data de nascimento, observações | Consumidor | Execução de contrato / legítimo interesse (fidelidade) |
| `sales` | vínculo com o consumidor, itens e valores | Consumidor | Obrigação legal (fiscal) |
| `quotes` | **nome e telefone digitados no balcão** (cópia, para imprimir no orçamento) | Consumidor | Execução de contrato (proposta comercial) |
| `delivery_orders` | telefone e endereço de entrega | Consumidor | Execução de contrato |
| `users` | nome, e-mail, hash de senha, último acesso | Funcionário da loja | Execução de contrato de trabalho |
| `audit_log` | endereço IP, autor e ação | Funcionário / superadmin | Obrigação legal (art. 37) e segurança |
| `tenants` | razão social, CNPJ, contato | Pessoa jurídica (fora do escopo da LGPD, exceto o contato) | — |

Não são tratados dados sensíveis (art. 5º, II) nem dados de crianças.

> **`quotes` é a tabela que mais escapa da atenção.** Ela guarda uma *cópia*
> do nome e telefone porque o orçamento precisa imprimi-los, e aceita cliente
> de balcão **sem cadastro** — nesse caso o dado existe ali e em nenhum outro
> lugar. Consequências práticas na seção 3 e na 6.

## 3. Direitos do titular — como atender hoje

| Direito (art. 18) | Recurso no sistema |
|---|---|
| Confirmação e acesso (I, II) | **Clientes → 📄** exporta um JSON com cadastro, fidelidade, histórico de compras **e orçamentos** |
| Correção (III) | Clientes → ✏️ edita qualquer campo |
| Portabilidade (V) | O mesmo JSON da exportação, formato aberto |
| **Eliminação (VI)** | **Clientes → 🔒** anonimiza: apaga nome, CPF, e-mail, telefone, endereço, nascimento e observações do cadastro, **e limpa nome/telefone dos orçamentos do titular**; mantém a venda sem dono identificável |
| Informação sobre compartilhamento (VII) | Ver seção 5 |
| Revogação de consentimento (IX) | Anonimização |

> **Corrigido em 08/08/2026:** a anonimização apagava o cadastro mas deixava
> nome e telefone vivos em `quotes` — o pedido de eliminação era atendido pela
> metade, e o dado continuava pesquisável pelo número do orçamento. Hoje a
> rotina limpa as duas tabelas na mesma operação, e há teste travando a regra
> (`Anonymize_AlsoScrubsQuotes`).

**Por que anonimizar em vez de excluir:** a venda e a NFC-e têm guarda
obrigatória (5 anos, legislação fiscal). Apagar a linha destruiria a
escrituração. A anonimização atende o direito do titular *e* preserva a
obrigação legal — é a solução recomendada pela própria ANPD para esse conflito.
O cadastro fica com status `anonymized` e a data em `anonymized_at`, servindo de
prova de que o pedido foi atendido.

## 4. Medidas de segurança (art. 46)

- **Isolamento entre lojas:** Row Level Security no PostgreSQL. Cada consulta é
  filtrada pelo `tenant_id` da claim do JWT, no banco — uma falha de query não
  vaza dados de outro cliente.
- **Senhas:** BCrypt (hash + salt). Nunca trafegam nem são armazenadas em texto.
- **Transporte:** HTTPS/TLS em todas as pontas.
- **Controle de acesso:** papéis superadmin / admin / gerente / caixa; escrita
  em cadastros bloqueada para o caixa; anonimização restrita ao admin.
- **Registro de operações (art. 37):** `audit_log` grava login, criação e
  alteração de usuário, redefinição de senha, acesso de suporte
  (impersonação), exportação de dados pessoais, anonimização e exclusão de
  cliente, sangria de caixa e devolução de venda — com autor, IP e data.
- **Autorização de operações sensíveis:** desconto acima da alçada, sangria e
  devolução exigem código + PIN de gerente ou admin, validados no servidor.
  Quem autorizou fica registrado no lançamento e no `audit_log`.
- **Backup:** dump diário criptografado em repouso, retenção de 30 dias, além
  do point-in-time recovery do Neon.

## 5. Transferência internacional (art. 33) — PENDENTE

| Componente | Local | Situação |
|---|---|---|
| Banco de dados (Neon) | São Paulo (`sa-east-1`) | ✅ dados em repouso no Brasil |
| Backend (Render) | **Estados Unidos** | ⚠️ processamento fora do Brasil |
| Dashboard (Render static) | CDN global | ⚠️ apenas arquivos estáticos, sem dado pessoal |
| Backups (GitHub Actions) | Estados Unidos | ⚠️ o dump contém dados pessoais |
| Instalador do PDV (GitHub Releases) | Estados Unidos | ✅ só binário, sem dado pessoal |

O Render **não oferece região no Brasil** — as regiões disponíveis são Oregon,
Ohio, Virginia, Frankfurt e Singapura. Portanto há transferência internacional
de dados pessoais, e ela precisa de base legal. Dois caminhos:

1. **Manter e formalizar:** assinar o DPA (Data Processing Agreement) do Render
   e do GitHub, e declarar a transferência na política de privacidade com as
   cláusulas-padrão (art. 33, II). É o caminho rápido.
2. **Repatriar:** migrar a aplicação para infraestrutura no Brasil (VPS
   nacional, AWS `sa-east-1`, Magalu Cloud). Elimina a questão e casa com o
   plano de VPS única já previsto para quando houver volume.

## 6. O que ainda falta (jurídico, fora do código)

- [ ] Política de privacidade publicada e link visível no dashboard e no PDV
- [ ] Termos de uso do SaaS
- [ ] Cláusula de tratamento de dados no contrato com cada lojista
- [ ] Encarregado (DPO) nomeado, com canal de contato divulgado
- [ ] Política de retenção (por quanto tempo guardar cadastro sem compra)
- [ ] Plano de resposta a incidente (art. 48: comunicar ANPD e titulares)
- [ ] DPA assinado com Render e GitHub (ver seção 5)
- [ ] Aviso no PDV quando o caixa pede CPF ("para o programa de fidelidade")

## 7. Lacunas técnicas conhecidas

| Lacuna | Risco | Encaminhamento |
|---|---|---|
| **Orçamento de balcão sem cadastro** guarda nome e telefone soltos em `quotes`. Não há cliente para o titular pedir eliminação — ele não está em `customers`. | Médio: o dado fica sem rota de eliminação pela tela. | Criar expurgo por retenção (ex.: limpar nome/telefone de orçamentos fechados ou vencidos há mais de N meses). Depende da política de retenção, que ainda não existe. |
| **Política de retenção inexistente.** Nada é apagado por idade — cadastro sem compra há anos continua ali. | Médio: art. 15/16 (fim do tratamento). | Definir prazos com o jurídico e implementar rotina. |
| `audit_log` cresce sem expurgo. | Baixo. | Definir retenção junto com o item acima. |
