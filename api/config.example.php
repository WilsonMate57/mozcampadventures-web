<?php
/**
 * MOZ CAMP ADVENTURES — exemplo de configuração da API.
 * Copiar para FORA da pasta pública, por exemplo:
 *   /var/www/vhosts/mozcampadventures.co.mz/private/mca-config.php
 * (ou indicar o caminho na variável de ambiente MCA_CONFIG).
 * Nunca colocar credenciais reais no repositório.
 */

return [
    'db' => [
        'dsn'  => 'pgsql:host=localhost;port=5432;dbname=mca',
        'user' => 'mca_app',
        'pass' => 'ALTERAR',
    ],
    'app' => [
        'timezone'        => 'Africa/Maputo',
        'secret'          => 'ALTERAR-para-64-caracteres-aleatorios',   // hash de IPs; gerar com: php -r "echo bin2hex(random_bytes(32));"
        'allowed_origins' => ['https://mozcampadventures.co.mz', 'https://www.mozcampadventures.co.mz'],
        'site_url'        => 'https://mozcampadventures.co.mz',          // usado nos links de convite do painel
        'cookie_secure'   => true,                                       // cookie de sessão só por HTTPS
        'data_dir'        => null,                                       // null = <httpdocs>/data
        'storage_dir'     => '/var/www/vhosts/mozcampadventures.co.mz/private/storage',   // PDFs das facturas e rascunho do catálogo (FORA do httpdocs)
        'node_bin'        => '/opt/plesk/node/22/bin/node',              // Node.js para publicar o catálogo a partir do painel (scripts/publish.mjs)
    ],
    'mail' => [
        'transport' => 'resend',                                         // 'resend' (API do Resend, recomendado), 'mail' (sendmail do Plesk) ou 'log' (não envia)
        'resend_key' => '',                                              // preferível: variável de ambiente RESEND_API_KEY (re_…). Nunca no repositório.
        'from'      => 'no-reply@mozcampadventures.co.mz',               // com Resend: domínio verificado em resend.com/domains
        'from_name' => 'Moz Camp Adventures',
        'team'      => 'booking@mozcampadventures.co.mz',                // recebe os pedidos de reserva
        'contact'   => 'info@mozcampadventures.co.mz',                   // recebe as mensagens de contacto
    ],
    /* Avisos de novos pedidos à equipa pelo WhatsApp (Meta WhatsApp Cloud API). Números e interruptor: painel → Definições. */
    'whatsapp' => [
        'mode'            => 'api',                                      // 'api' (envia) ou 'log' (regista sem enviar)
        'token'           => '',                                         // ou no painel (fica cifrado), ou variável de ambiente WHATSAPP_TOKEN
        'app_secret'      => '',                                         // valida o webhook: painel ou WHATSAPP_APP_SECRET
        'verify_token'    => '',                                         // verificação do webhook: painel ou WHATSAPP_VERIFY_TOKEN
        'phone_number_id' => '',                                         // WhatsApp Manager → API Setup → Phone number ID (não é o número de telefone)
        'template'        => 'nova_reserva',                             // modelo aprovado (Utility), 7 variáveis: ver docs/NOTIFICACOES.md §6.3
        'language'        => 'pt_PT',                                    // idioma dos modelos em português, igual ao aprovado
        'language_en'     => 'en_US',                                    // idioma dos modelos em inglês
        'button'          => false,                                      // true se o modelo tiver o botão «Abrir no painel» (URL dinâmico)
        'api_version'     => 'v21.0',
    ],
    'limits' => [
        'bookings_per_hour' => 10,
        'contacts_per_hour' => 5,
        'reviews_per_day'   => 3,
    ],
];
