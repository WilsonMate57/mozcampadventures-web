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
        'storage_dir'     => '/var/www/vhosts/mozcampadventures.co.mz/private/storage',   // PDFs das facturas (FORA do httpdocs)
    ],
    'mail' => [
        'transport' => 'mail',                                           // 'mail' (sendmail do Plesk) ou 'log' (não envia)
        'from'      => 'no-reply@mozcampadventures.co.mz',
        'from_name' => 'Moz Camp Adventures',
        'team'      => 'booking@mozcampadventures.co.mz',                // recebe os pedidos de reserva
        'contact'   => 'info@mozcampadventures.co.mz',                   // recebe as mensagens de contacto
    ],
    'limits' => [
        'bookings_per_hour' => 10,
        'contacts_per_hour' => 5,
        'reviews_per_day'   => 3,
    ],
];
