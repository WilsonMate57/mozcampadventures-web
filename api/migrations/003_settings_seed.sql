-- ============================================================
-- MOZ CAMP ADVENTURES — 003_settings_seed.sql (Fase 5)
-- Dados iniciais da empresa e das instruções de pagamento
-- (fornecidos pelo cliente em 28/10/2026; editáveis no painel).
-- ============================================================

INSERT INTO settings (key, value) VALUES
('company', '{
  "trade_name": "Moz Camp Adventures",
  "legal_name": "Mozambique Camp Adventures",
  "nuit": "459001987",
  "address": "Marina, Escola Náutica, Cidade de Maputo, Moçambique",
  "phone": "+258 84 440 6543",
  "email": "info@mozcampadventures.co.mz",
  "website": "mozcampadventures.co.mz",
  "tax_regime": "ISPC",
  "tax_note": "Contribuinte sujeito ao ISPC — imposto incluído no preço."
}'::jsonb),
('payment', '{
  "methods": [
    {"type": "bank", "label": "Nedbank", "account": "00026449008", "nib": "0043 0000 0002 6449 0085 9"},
    {"type": "bank", "label": "Millennium bim", "account": "1068386228", "nib": "0001 0000 0106 8386 2285 7"},
    {"type": "mobile", "label": "M-Pesa", "number": "+258 84 440 6543"},
    {"type": "mobile", "label": "e-Mola", "number": "", "pending": true}
  ],
  "note": "Indique a referência da factura no pagamento e envie o comprovativo para booking@mozcampadventures.co.mz ou WhatsApp +258 84 440 6543."
}'::jsonb),
('invoicing', '{
  "series": {"FT": "Factura", "PF": "Factura pró-forma"},
  "number_format": "{type}-{year}/{seq4}",
  "footer": "Documento processado por computador.",
  "pending_validation": "Formato e menções legais a validar pelo contabilista."
}'::jsonb);
