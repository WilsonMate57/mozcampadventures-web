# Catálogo no painel: pacotes, preços e fotos

29/10/2026. Concluído localmente; não publicado.

O pedido: no painel, criar pacotes novos e editar os existentes, desde o preço até às informações importantes, e actualizar as fotos da galeria de cada pacote.

## 1. Como funciona

```
Painel ──grava──▶ rascunho (private/storage/catalog-draft/, fora do site)
                    │
              «Publicar no site» (Administrador)
                    ▼
   cópia de segurança (private/storage/catalog-history/<data>/)
   rascunho ──▶ data/*.json  ──▶ node scripts/publish.mjs (fotos WebP + páginas)
                    │
         falhou? ──▶ repõe data/*.json anteriores e regenera o site
```

- **O rascunho não afecta o site.** Até publicar, o site e os preços cobrados nas reservas continuam iguais.
  - A partir da publicação, as novas reservas usam os preços e regras novos.
  - As reservas já feitas não mudam.
- **O catálogo continua em `data/*.json`.** É a mesma fonte do site e do cálculo de preços no servidor, por isso não há uma segunda cópia na base de dados que possa divergir.
- **Pacotes não se apagam, desactivam-se.** O endereço passa a mostrar «indisponível» e não aceita reservas, o que preserva os links e o SEO.
- **Versões anteriores:** cada publicação guarda a versão que substituiu (as últimas 20).
  - «Carregar» põe essa versão no rascunho, para rever e publicar.
  - Um pacote criado depois dessa versão fica desactivado; não desaparece.

## 2. O que se edita

| Separador | Campos |
|---|---|
| Geral | Nome, subtítulo, categoria (ou zona, nos alojamentos), local, destinos, duração, etiqueta de destaque, estrelas, descrição curta, visível/desactivado |
| Preços e regras | Preço desde, preço antigo (riscado), unidade do preço, preço e etiqueta de criança, cancelamento; forma de cobrança (por pessoa / por grupo-barco; nos alojamentos, por pessoa ou por unidade por noite), mínimo e máximo de participantes, mínimo de noites e tarifas por número de noites |
| Conteúdo | Texto detalhado (parágrafos), destaques, inclui, não inclui, informações importantes, comodidades (alojamentos) |
| Itinerário | Passos com hora, título, descrição e lista; subir, descer, remover |
| Opções e menu (experiências) | Barcos privados (preço, capacidade, escolha obrigatória), extras (preço por pessoa ou por reserva), transfers privados, menus com secções e pratos |
| Galeria | Carregar (arrastar ou escolher), reordenar (arrastar ou setas), «Topo» (1.ª foto = topo da página), «Cartão» (foto dos cartões e da partilha), retirar |

- **Inglês:** o selector «Português | English» edita os mesmos textos em `data/en.json`.
  - O texto português aparece como sugestão em cada campo.
  - Um campo vazio mostra o português no site em inglês.
  - Preços, regras e fotos são comuns às duas línguas.
- **Validação no servidor:**
  - preço antigo maior que o preço;
  - mínimo de participantes ≤ máximo;
  - fotos só dentro de `assets/images/`;
  - para activar um pacote são precisos preço, descrição e pelo menos uma foto.
  - Os erros aparecem num resumo com ligação ao campo.
- **Alterações por guardar:**
  - sair do editor pede confirmação;
  - fechar a página também avisa;
  - Ctrl+S grava.

## 3. Fotos

- **Redução no browser:** cada foto é reduzida a 2400 px, no máximo, e convertida em JPEG antes do envio.
  - O envio fica rápido mesmo por dados móveis.
  - Os metadados da câmara (incluindo a localização GPS do telemóvel) são removidos.
- **Verificação no servidor:**
  - tipo real pelo conteúdo (JPEG, PNG ou WebP);
  - até 8 MB;
  - mínimo de 600×400 px;
  - até 40 fotos por pacote.
- **Onde ficam:** `assets/images/packages/<pacote>/` ou `assets/images/accommodation/<pacote>/`, com nome aleatório.
- **Variantes WebP:** as de 480, 960 e 1600 px são geradas ao publicar.
- **Fotos retiradas:** retirar uma foto tira-a da galeria, mas o ficheiro fica no servidor, para que as versões anteriores continuem completas.
- **Visibilidade antes de publicar:** uma foto carregada mas ainda não publicada é acessível a quem souber o endereço exacto (aleatório), mas não aparece em nenhuma página.

## 4. Permissões

| Permissão | Quem a tem por omissão | Permite |
|---|---|---|
| `catalog.edit` | Administrador, Gerente (migração 007) | Criar pacotes, editar o rascunho, carregar fotos, descartar o rascunho |
| `catalog.publish` | Administrador | Publicar no site, ver e carregar versões anteriores |

Atribuíveis a outros perfis em **Utilizadores e perfis**. Cada gravação, foto, publicação (incluindo as falhadas), descarte e versão carregada fica na **Auditoria**.

## 5. API (`/api/admin/catalog/*`)

| Rota | Função |
|---|---|
| `GET /catalog/items` | Lista do rascunho, alterações por publicar, categorias |
| `POST /catalog/items` | Criar pacote `{kind, name, category, slug?}` (fica desactivado) |
| `GET` / `POST /catalog/items/{id}` | Ler / gravar `{item, en, rules}` |
| `POST /catalog/items/{id}/photos` | Foto (multipart, campo `photo`) |
| `POST /catalog/discard` | Descartar o rascunho |
| `POST /catalog/publish` | Publicar (cópia de segurança, geração, reposição automática se falhar) |
| `GET /catalog/history` · `POST /catalog/history/{id}/restore` | Versões anteriores |

Mesma sessão, permissões, CSRF e verificação de origem do resto do painel. Só uma gravação ou publicação de cada vez (bloqueio em `storage/catalog.lock`). Código: `api/src/CatalogAdmin.php`, `scripts/publish.mjs`, `admin/admin.js` (`experiences`, `editor`).

## 6. Requisitos no servidor (Plesk)

- **Node.js 20 ou superior** (extensão Node.js do Plesk) e, na pasta do site, `npm ci --omit=dev` (instala o `sharp`). Ver `DEPLOYMENT.md` §3.1f.
- **`app.node_bin`** na configuração: o caminho do `node`, ex.: `/opt/plesk/node/22/bin/node`.
- **Permissões de escrita** para o utilizador do PHP em:
  - `data/`;
  - `assets/images/` (incluindo `_opt/`);
  - nas páginas geradas (`*.html`, `tours/`, `alojamentos/`, `en/`, `sitemap.xml`);
  - em `private/storage/`.
- `scripts/`, `data/`, `node_modules/` e `package*.json` vão no pacote, mas estão bloqueados ao público no `.htaccess` e nas regras nginx.

> **Importante, depois de publicar:** o catálogo no servidor passa a ser a versão de referência. Antes de preparar um pacote novo no computador de desenvolvimento, copiar do servidor `data/*.json` e as pastas de fotos novas (`assets/images/packages/`, `assets/images/accommodation/`). Caso contrário, o pacote novo apaga as edições feitas no painel (`PUBLICACAO.md` §2).

## 7. Testes

- **`tests/catalog.mjs`: 37/37.** Cobre:
  - acesso e permissões;
  - edição e validação;
  - rascunho sem efeito no site;
  - criação de pacote;
  - fotos (tipo falso, pequena demais, sem CSRF);
  - publicação, com a página nova em PT e EN, WebP e preço usado na reserva;
  - mínimo de participantes no servidor;
  - falha de geração com reposição automática;
  - descarte;
  - versões anteriores;
  - auditoria.
  - Guarda e repõe `data/*.json`, o rascunho, as fotos e as páginas de teste.
- **`tests/admin-ui.mjs`: 54/54, com 12 testes novos (U39–U50) no Chrome.** Cobrem:
  - criar pacote, separadores e o aviso de alterações por guardar;
  - resumo de erros com ligação ao campo;
  - modo «English»;
  - itinerário e extras;
  - foto pelo campo de ficheiro real, reduzida de 3200 para 2400 px;
  - guardar;
  - confirmação ao sair;
  - barra «por publicar», editor a 390 px e descartar.
- Capturas em `docs/visual-review/painel-v2/14-*` a `18-*`.

## 8. Limitações

- **Categorias:** nomes, ícones e imagens das 8 categorias estão em `data/categories.json` e não se editam no painel.
- **Ordem dos pacotes:** é a ordem dos ficheiros (os novos ficam no fim) e não se muda no painel.
- **Disponibilidade e lotação por data:** continuam a não existir.
- **Pré-visualização:** não há antes de publicar. Os pacotes novos podem ser publicados desactivados, rever-se no endereço e activar-se depois.
- **Edições em simultâneo:** duas pessoas a editar o mesmo pacote ao mesmo tempo: fica a última gravação.
