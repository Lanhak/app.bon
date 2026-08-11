<?php
// Friendly /admin entry point. The main application handles the actual admin session.
$_GET['admin'] = '1';
require __DIR__ . '/index.php';
