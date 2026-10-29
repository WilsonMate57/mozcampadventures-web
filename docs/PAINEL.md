# Painel de administração — redesign premium

28/10/2026. Concluído localmente; não publicado.

O pedido: um painel elegante, minimalista e interactivo, ao nível dos melhores produtos SaaS, mantendo a identidade da marca, sem dados inventados e sem perder funcionalidades.

## 1. Auditoria (antes)

| Área | Problema |
|---|---|
| Resumo | 11 cartões com o mesmo peso; sem período, sem tendências, sem desempenho por experiência, sem actividade recente, sem acções rápidas |
| Navegação | 11 ligações numa lista única, sem grupos |
| Reservas | Só pesquisa e estado; sem filtro de data ou de experiência, sem ordenação, sem paginação (cortava a 200 linhas); era preciso abrir cada reserva para agir |
| Pesquisa | Não havia pesquisa global |
| Carregamento e estados vazios | Só o texto «A carregar…» e «Sem…» genéricos |
| Tabelas | Nenhuma ordenável; cabeçalhos com fundo colorido |
| Formulários | Etiquetas não ligadas aos campos; no «Novo pedido», um erro do servidor fechava o diálogo e perdia o que foi escrito |
| Acessibilidade (com sessão) | Não estava testada |

## 2. Direcção visual

- **Identidade:**
  - **Cores:** turquesa `#00c6c1` como acento (barra do item activo, foco, gráficos, ícones), barra lateral no escuro do rodapé da marca (`#1e1e2e`) e neutros frios.
  - **Destaques:** laranja e amarelo só em estados que pedem atenção.
  - **Tipografia:** Inter, a do site; não há fontes novas.
- **Superfícies:** brancas com filetes de 1 px e sombras muito suaves; raios de 9 a 14 px; tabelas com cabeçalho neutro e linhas finas.
- **Estados:** etiquetas com ponto **e** texto, para nunca dependerem só da cor.
- **Botões:**
  - acção principal em turquesa escuro (`#00807d`, contraste de 4,8:1 com texto branco);
  - o turquesa vivo fica como acento, porque com texto branco só chega a 2,1:1.
- **Componentes:** selector segmentado de período, separadores com contagens, painel lateral, paleta de pesquisa, esqueletos de carregamento, estados vazios com ícone, avisos com ícone, botões com indicador de ocupado.
- Ficheiros: `admin/admin.css` (sistema visual), `admin/index.html` (estrutura), `admin/admin.js` (lógica).

## 3. O que mudou

### Navegação
- **Grupos:** Visão geral · Operação (Reservas, Clientes, Experiências, Mensagens, Avaliações) · Financeiro (Facturas, Pagamentos) · Sistema (E-mails, Utilizadores, Definições, Auditoria).
- **Contadores** do trabalho pendente real: pedidos por confirmar, mensagens novas, avaliações por moderar, pagamentos por verificar, e-mails falhados.
- **Barra superior:** caminho (grupo → página), pesquisa global e «Ver site».
- **Telemóvel:** menu deslizante com fundo escurecido.

### Resumo (centro de controlo)
- **Período:** Hoje, 7 dias, 30 dias, 90 dias, Este ano ou Personalizado. Fica no endereço, por isso o link pode ser partilhado.
- **Requer atenção** (estado actual): pedidos por confirmar (com quantos têm actividade em ≤ 7 dias), pagamentos por verificar, em dívida, mensagens, avaliações, e-mails falhados, rascunhos. Cada cartão abre a lista correspondente.
- **Indicadores do período,** com variação face ao período anterior de igual duração:
  - pedidos recebidos, confirmadas e cancelamentos (menos é melhor);
  - **Recebido** (pagamentos confirmados menos reembolsos);
  - **Facturado (FT)**, separado e nunca somado ao recebido.
- **Gráficos SVG próprios** (sem bibliotecas): pedidos e valores recebidos por dia, ou por mês acima de 92 dias, com dica ao passar o rato ou com o teclado.
- **Estado dos pedidos do período:** barra com as percentagens e ligações a cada estado.
- **Experiências mais procuradas:** pedidos, confirmadas e participantes.
- **Próximos 14 dias** (reservas confirmadas), **actividade recente** e **acções rápidas**.
- Uma nota explica cada definição.

### Reservas
- **Filtros combináveis:** pesquisa, experiência (só as que têm reservas), próximas ou passadas, intervalo de datas da actividade e separadores por estado com contagens.
- **Ordenação no servidor** por referência, cliente, data e total.
- **Paginação** de 25, 50 ou 100 por página.
- **No endereço:** o estado da lista fica guardado no endereço.
- **Marca «urgente»:** pedido por confirmar com actividade daqui a 7 dias ou menos.
- **Painel lateral:** um clique na linha abre o resumo da reserva (pedido, cliente com WhatsApp, pagamento, histórico) e as **acções de estado** com confirmação e nota, sem sair da lista. «Abrir reserva completa» leva à página detalhada. Esc fecha, e o foco volta à linha.

### Pesquisa global (Ctrl+K ou /)
- Encontra reservas (referência, nome, telefone, e-mail, experiência), clientes e facturas, conforme as permissões de cada utilizador.
- Também mostra as páginas e a acção «Novo pedido».
- Navegável com ↑ ↓ Enter Esc.

### Experiências
Desde 29/10/2026 também se criam e editam pacotes, preços, regras, textos PT/EN e fotos, com rascunho e publicação: ver `CATALOGO.md`. O que se segue descreve a lista.

- **Lista:** o catálogo real (`data/*.json`) com o preço desde, o mínimo (`booking-rules.json`) e o estado.
- **Desempenho dos últimos 90 dias:** pedidos, confirmadas, canceladas, próximas e último pedido.
- **Ordenação e acesso:** colunas ordenáveis; um clique abre as reservas dessa experiência.

### Em todo o painel
- **Tabelas ordenáveis:** clique no cabeçalho em facturas, pagamentos, clientes, e-mails, etc. Reconhece valores MZN e datas.
- **Etiquetas ligadas aos campos** em todas as páginas e diálogos; colunas de acções com nome para leitores de ecrã.
- **«Novo pedido»:**
  - obrigatórios marcados;
  - validação junto do campo ao sair dele;
  - se o servidor recusar (ex.: abaixo do mínimo), o diálogo **fica aberto com os valores** e mostra o erro;
  - o botão fica ocupado enquanto envia, o que impede pedidos duplicados.
- **Avisos e foco:** avisos com ícone de sucesso ou erro; foco visível em turquesa; respeita «reduzir movimento».

## 4. Novos pontos na API (`api/src/Admin.php`)

| Rota | Função |
|---|---|
| `GET /api/admin/dashboard?from&to` | Indicadores do período e do anterior, séries, estado, top de experiências, «requer atenção», próximos 14 dias, actividade. Intervalo até 2 anos |
| `GET /api/admin/bookings?q&status&item&when&from&to&sort&dir&page&per` | Lista com filtros, ordenação (lista fechada de colunas), paginação e contagens por estado |
| `GET /api/admin/search?q` | Pesquisa global, que respeita `bookings.view`, `customers.view` e `invoices.view` |
| `GET /api/admin/experiences` | Catálogo com desempenho (só leitura; `bookings.view`) |

Tudo continua sob a mesma sessão, as mesmas permissões e o mesmo CSRF. Não há escritas novas: as acções do painel lateral usam a rota de estado que já existia.

## 5. Testes

- **`tests/admin-ui.mjs`:** 42/42, com 8 testes novos e 3 actualizados para o novo resumo.
  - **Actualizados:** resumo com períodos (U3, U5, U5b) e menu agrupado (U4).
  - **Reservas:** filtros e contagens (U31), ordenação (U32), painel lateral (U33, U34).
  - **Pesquisa e catálogo:** Ctrl+K (U35) e experiências (U36).
  - **Formulários:** validação (U37) e erro do servidor sem perder valores (U38).
- **Restantes baterias:** todas a passar (painel e facturas 51, pagamentos 44, notificações 28, contas 34, API 47, site 44 + 46). Pagamentos e notificações foram ajustados ao novo formato do resumo; continuam a verificar o mesmo.
- **Acessibilidade com sessão iniciada (axe-core, WCAG 2.1 AA):** sem violações. Páginas verificadas:
  - resumo, reservas, painel lateral e reserva;
  - experiências, clientes;
  - facturas e factura, pagamentos;
  - mensagens, avaliações, e-mails;
  - utilizadores, definições, auditoria.
- **Responsivo e browser:**
  - **Ecrãs testados:** 1440 e 390 px, sem scroll horizontal, com o menu móvel a funcionar.
  - **Erros:** nenhum erro de JavaScript nem de CSP.
  - **Capturas:** em `docs/visual-review/painel-v2/`.

## 6. Limitações (o que não existe e não foi inventado)

- **Experiências, preços e conteúdos:** editam-se no painel desde 29/10/2026 (`CATALOGO.md`). As categorias e a ordem dos pacotes não.
- **Disponibilidade e lotação por data:** o sistema não as guarda.
- **Relatórios exportáveis (CSV/PDF):** não existem. Os números estão no resumo e nas listas.
- **Valores em desenvolvimento:** os números das capturas são da base de desenvolvimento, cheia de reservas de teste (ex.: «922 pedidos»). Em produção vão mostrar os dados reais.
- **«Recebido» e «Facturado»:** dependem de pagamentos e facturas registados no painel. Nada é estimado.
