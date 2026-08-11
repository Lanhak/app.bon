<?php
/*
 * BON Render database configuration.
 *
 * IMPORTANT:
 * MySQL is NOT running inside the Render PHP container.
 * Set these variables in Render -> Environment:
 *
 * BON_DB_HOST
 * BON_DB_PORT   (usually 3306)
 * BON_DB_NAME
 * BON_DB_USER
 * BON_DB_PASS
 *
 * Optional:
 * BON_API_SECRET
 * BON_ADMIN_EMAIL
 * BON_ADMIN_PASSWORD
 */

function bon_env($name, $default = '') {
    $v = getenv($name);
    return ($v !== false && trim((string)$v) !== '') ? trim((string)$v) : $default;
}

/*
 * Accept BON_* names first. The MYSQL_* aliases make it easier to connect
 * a third-party MySQL service without changing any BON PHP endpoint.
 */
$dbHost = bon_env('BON_DB_HOST', bon_env('MYSQL_HOST', ''));
$dbPort = bon_env('BON_DB_PORT', bon_env('MYSQL_PORT', '3306'));
$dbName = bon_env('BON_DB_NAME', bon_env('MYSQL_DATABASE', ''));
$dbUser = bon_env('BON_DB_USER', bon_env('MYSQL_USER', ''));
$dbPass = bon_env('BON_DB_PASS', bon_env('MYSQL_PASSWORD', ''));

return [
    'db' => [
        'host' => $dbHost,
        'name' => $dbName,
        'user' => $dbUser,
        'pass' => $dbPass,
        'port' => $dbPort,
    ],

    'api_secret' => bon_env('BON_API_SECRET'),
    'admin_email' => bon_env('BON_ADMIN_EMAIL'),
    'admin_password' => bon_env('BON_ADMIN_PASSWORD'),

    'prices' => [
        24 => 2000,
        720 => 50000,
        2160 => 120000
    ],

    'banks' => [
        'Sacombank' => [
            'account' => bon_env('BON_BANK_SACOMBANK_ACCOUNT'),
            'name' => bon_env('BON_BANK_SACOMBANK_NAME')
        ],
        'VietinBank' => [
            'account' => bon_env('BON_BANK_VIETINBANK_ACCOUNT'),
            'name' => bon_env('BON_BANK_VIETINBANK_NAME')
        ]
    ],

    'withdraw_min' => 10000,
];
