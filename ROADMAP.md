# Roadmap

Regra de ouro: **cada item termina com algo usável.** Nada de meia-feature.

## ✅ Fase 0 — Fundação (feita)
- [x] Estrutura do repo, stack, tema
- [x] Models: Account, Category, Transaction (centavos + enums)
- [x] CRUD completo: contas, categorias, transações (com filtros)
- [x] `/api/dashboard/summary` (saldo, receitas, despesas, economia, % vs mês anterior)
- [x] Sidebar completa + Dashboard com 4 cards + últimas transações
- [x] Navegação mobile: bottom tab bar (Início · Transações · + · Relatórios · Mais)

## ✅ Fase 1 — MVP usável no dia a dia (feita)
- [x] Tela Transações: timeline agrupada por dia + filtros (período, categoria, conta, tipo, busca)
- [x] Painel "Nova transação" (atalho `N`; no mobile, botão + da bottom bar)
- [x] Tela Contas: cards com saldo + última movimentação, CRUD com exclusão protegida
- [x] Tela Categorias: CRUD com ícone/cor/limite + gasto do mês (delete = SET NULL)
- [x] Editar/excluir/duplicar transação (mesmo painel, modo edição)

## ✅ Fase 2 — Análise (feita)
- [x] Donut "gastos por categoria" no dashboard (clicável → filtra via URL)
- [x] Gráfico de área: evolução do patrimônio (12 meses, saldo reconstruído)
- [x] Orçamentos: barras de progresso + navegação de mês (80% amarelo, 100% vermelho)
- [x] Detalhe de categoria: resumo, gráfico 6 meses, top estabelecimentos, subcategorias

## ✅ Revisão — Subcategorias de verdade (feita)
- [x] Roll-up: total da mãe = gasto próprio + filhas (donut, detalhe, orçamentos)
- [x] Selects com hierarquia: "Alimentação › Delivery" (transação, filtros, orçamento)
- [x] Linhas de transação mostram a mãe: "Delivery (Alimentação)"
- [x] Limitar a 1 nível (mãe → filha, sem neta) — validado no backend
- [x] Decidido: orçamento na mãe cobre as filhas (via roll-up na listagem)

## ✅ Fase 3 — Cartões + tempo (feita)
- [x] Cartões: limite, fechamento, vencimento, fatura (ciclo derivado), parcelamentos, pagamento como transfer, migração de schema
- [x] Próximas contas a pagar (widget no dashboard, previsto das recorrências)
- [x] Calendário mensal com receitas/despesas por dia + detalhe sob demanda
- [x] Metas com depósitos associados (tabelas novas, delete em cascata)

## ✅ Fase 4 — Premium feel (feita)
- [x] Pesquisa global (Ctrl+K ou /): páginas, categorias, contas, cartões, transações
- [x] Comando rápido: `+ mercado 82` cria transação (na palette)
- [x] Insights automáticos: 6 regras (orçamentos, variação por categoria, ritmo do mês, economia, patrimônio, maior gasto)
- [x] Simulações: cancelar assinatura, guardar por mês → meta, reduzir categoria, quitar cartão
- [x] Undo ao excluir (toast recria via POST) · drag de widgets com ordem em localStorage
- [x] Relatórios: abas Mensal/Anual, receitas×despesas, ranking por período, export CSV (Excel pt-BR)
- [x] PWA: manifest + ícones + service worker (API nunca cacheada)

## Próximos (fora do roadmap original)
- [x] Transferência entre contas (to_account_id; saldo debita origem/credita destino; painel com De→Para)
- [x] Autenticação: senha única (bcrypt) + sessão em cookie HttpOnly/SameSite, rate limit no login, troca de senha invalida sessões, middleware allowlist
