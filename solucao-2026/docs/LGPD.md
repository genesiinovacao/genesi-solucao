# LGPD — mapeamento de dados e conformidade técnica

> Documento técnico para orientar a adequação jurídica. **Não substitui parecer
> de advogado.** Última revisão: 25/07/2026.

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
| `delivery_orders` | telefone e endereço de entrega | Consumidor | Execução de contrato |
| `users` | nome, e-mail, hash de senha, último acesso | Funcionário da loja | Execução de contrato de trabalho |
| `audit_log` | endereço IP, autor e ação | Funcionário / superadmin | Obrigação legal (art. 37) e segurança |
| `tenants` | razão social, CNPJ, contato | Pessoa jurídica (fora do escopo da LGPD, exceto o contato) | — |

Não são tratados dados sensíveis (art. 5º, II) nem dados de crianças.

## 3. Direitos do titular — como atender hoje

| Direito (art. 18) | Recurso no sistema |
|---|---|
| Confirmação e acesso (I, II) | **Clientes → 📄** exporta um JSON com cadastro, fidelidade e histórico de compras |
| Correção (III) | Clientes → ✏️ edita qualquer campo |
| Portabilidade (V) | O mesmo JSON da exportação, formato aberto |
| **Eliminação (VI)** | **Clientes → 🔒** anonimiza: apaga nome, CPF, e-mail, telefone, endereço, nascimento e observações; mantém a venda sem dono identificável |
| Informação sobre compartilhamento (VII) | Ver seção 5 |
| Revogação de consentimento (IX) | Anonimização |

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
  cliente — com autor, IP e data.
- **Backup:** dump diário criptografado em repouso, retenção de 30 dias, além
  do point-in-time recovery do Neon.

## 5. Transferência internacional (art. 33) — PENDENTE

| Componente | Local | Situação |
|---|---|---|
| Banco de dados (Neon) | São Paulo (`sa-east-1`) | ✅ dados em repouso no Brasil |
| Backend (Render) | **Estados Unidos** | ⚠️ processamento fora do Brasil |
| Dashboard (Netlify) | CDN global | ⚠️ apenas arquivos estáticos, sem dado pessoal |
| Backups (GitHub Actions) | Estados Unidos | ⚠️ o dump contém dados pessoais |

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
