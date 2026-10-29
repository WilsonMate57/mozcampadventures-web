# Contas de cliente — Moz Camp Adventures

27/10/2026. Os clientes podem criar uma conta no site para ver as suas reservas e escolher receber promoções. O cliente pediu (27/10/2026) que a conta funcione **logo após o registo**, sem confirmação por e-mail nem outra autenticação, e **sem ferramentas externas** de promoções (Mailchimp/Brevo).

## 1. O que o cliente pode fazer (`/conta/`, `/en/account/`)

| Função | Como funciona |
|---|---|
| Criar conta | Nome, e-mail, telefone (opcional), palavra-passe (mínimo 8 caracteres, com letras e números) e aceitação dos Termos e da Privacidade. Há uma caixa **por marcar** para receber promoções. A conta fica activa e com a sessão iniciada de imediato |
| Entrar | E-mail e palavra-passe. A sessão dura até 30 dias, ou 14 dias sem actividade |
| Reservar | Com a sessão iniciada, o formulário vem preenchido e o pedido fica na conta |
| Ver reservas | As reservas feitas com a sessão iniciada. Cada uma abre a área da reserva: ticket com QR, facturas, recibos e comprovativos |
| Dados e preferências | Nome, telefone e idioma dos e-mails; ligar e desligar promoções (com data) |
| Palavra-passe | Alterar (exige a actual e termina as outras sessões). Se a esquecer, recebe por e-mail um link de 1 hora |
| Apagar conta | Com a palavra-passe. Apaga a conta e as sessões; as reservas e os documentos fiscais ficam, por obrigação legal, sem ligação à conta |

O ícone de pessoa no cabeçalho e o menu do telemóvel levam à conta. Se o e-mail já tiver conta, o registo responde «Já existe uma conta com este e-mail. Entre, ou use “Esqueci-me da palavra-passe”».

## 2. Porque as reservas não são ligadas pelo e-mail

Como o e-mail não é confirmado, qualquer pessoa pode criar uma conta com um e-mail que não é seu. Se as reservas fossem ligadas pelo e-mail, essa pessoa veria as reservas, os dados e as facturas do dono do e-mail. Por isso uma reserva só pertence à conta quando é feita **com a sessão iniciada** (`bookings.customer_id`). Há um teste específico para isto (B5).

**Consequências:**
- Reservas feitas antes de criar a conta, ou sem a sessão iniciada, não aparecem na conta. O cliente continua a ter o link da área da reserva no ticket e no e-mail.
- Se no futuro quiserem juntar reservas antigas à conta, a forma segura é um botão «Juntar à minha conta» na área da reserva: quem tem o link da reserva prova que é o titular.

## 3. Promoções

- O site guarda quem aceitou receber promoções e quando (`marketing_opt_in`, `marketing_consent_at`), e quando cancelou (`marketing_withdrawn_at`).
- No painel, em **Clientes**, o filtro «Aceitam promoções» mostra essa lista.
- O envio das promoções fica para decidir. Não há exportação nem integração com ferramentas externas.

## 4. Segurança e privacidade

- **Contas separadas:** as contas de cliente estão separadas das da equipa (tabela `customers`, sessões `customer_sessions`, cookie `mca_customer`). Um cliente nunca tem acesso ao painel.
- **Palavras-passe:** guardadas cifradas (`password_hash`), nunca em texto.
- **Cookie de sessão:** HttpOnly + Secure + SameSite=Strict. As escritas exigem token CSRF e origem permitida.
- **Cookie `mca_in=1`:** é visível ao JavaScript, mas só serve para o cabeçalho e o formulário saberem que há sessão; não dá acesso a nada.
- **Limites:** 5 tentativas de entrada em 15 min (por e-mail e IP); limites também no registo e na reposição.
- **«Esqueci-me»:** responde sempre o mesmo, por isso não revela se o e-mail tem conta.
- **Registo:** revela se o e-mail já tem conta. É inevitável sem confirmação por e-mail, e é o comportamento habitual.
- **Link de reposição:**
  - **não fica no registo de e-mails** do painel, que mostra «[link secreto — não registado]»;
  - este e-mail também não pode ser reenviado pelo painel; o cliente pede um novo link;
  - o token vai no fragmento (`#reset=…`), por isso não chega aos registos do servidor.
- **Política de privacidade:** actualizada (PT/EN) com a conta, as reservas associadas, as promoções e o cookie de sessão. Continua provisória, até revisão.

## 5. Painel: «Clientes»

- **Lista:** nome, contacto, idioma, promoções (com data), n.º de reservas da conta e último acesso; pesquisa e filtro «Aceitam promoções».
- **Permissão:** `customers.view` (o Gerente tem-na por omissão).

## 6. Instalação no servidor

- `php httpdocs/api/bin/migrate.php` aplica a `006_customer_accounts`.
- O e-mail de reposição usa o mesmo envio dos outros e-mails, por isso o SPF/DKIM do domínio continua a ser importante.

## 7. Testes

- **`tests/accounts.mjs`:** 34 testes, todos a passar.
  - registo com sessão imediata e e-mail repetido;
  - entrada e força bruta;
  - reservas da conta, incluindo a reserva sem sessão que não entra e o e-mail de outra pessoa (B5);
  - CSRF e origem;
  - promoções com data;
  - palavra-passe e reposição, com o link fora do registo de e-mails;
  - lista no painel;
  - apagar conta.
- **No browser:** criar conta → painel imediato → reserva pelo formulário (pré-preenchido) → reserva na conta. Sem erros de JavaScript nem de CSP. Auditoria axe sem violações em `/conta/` e `/en/account/`.
