-- ============================================================
-- MOZ CAMP ADVENTURES — 007_catalog_editor.sql
-- Editor do catálogo no painel.
-- O catálogo continua em data/*.json (o painel edita um rascunho e publica; ver docs/CATALOGO.md).
-- Permissões novas: catalog.edit (rascunho, fotos) e catalog.publish (publicar, versões anteriores).
-- O Gerente recebe catalog.edit por omissão; publicar fica com o Administrador ('*') até ser atribuído.
-- ============================================================
UPDATE roles SET permissions = permissions || ARRAY['catalog.edit']
WHERE code = 'gerente' AND NOT ('catalog.edit' = ANY (permissions));
