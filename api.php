<?php
/**
 * LAZO Production Backend API
 * Secure multi-pet storage & owner authentication
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Data Directory Setup
$DATA_DIR = __DIR__ . '/data';
if (!is_dir($DATA_DIR)) {
    mkdir($DATA_DIR, 0755, true);
    file_put_contents($DATA_DIR . '/.htaccess', "Deny from all\n");
}

$USERS_FILE = $DATA_DIR . '/users.json';
$PETS_FILE  = $DATA_DIR . '/pets.json';
$TAGS_FILE  = $DATA_DIR . '/tags.json';
$SCANS_FILE = $DATA_DIR . '/scans.json';

// Helpers
function loadJson($file, $default = []) {
    if (!file_exists($file)) return $default;
    $content = file_get_contents($file);
    $data = json_decode($content, true);
    return is_array($data) ? $data : $default;
}

function saveJson($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function getBearerToken() {
    // 1. Check getallheaders
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $k => $v) {
            if (strtolower($k) === 'authorization' && preg_match('/Bearer\s(\S+)/i', $v, $matches)) {
                return $matches[1];
            }
        }
    }
    // 2. Check $_SERVER variables (Apache / FastCGI / LiteSpeed)
    if (!empty($_SERVER['HTTP_AUTHORIZATION']) && preg_match('/Bearer\s(\S+)/i', $_SERVER['HTTP_AUTHORIZATION'], $matches)) {
        return $matches[1];
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) && preg_match('/Bearer\s(\S+)/i', $_SERVER['REDIRECT_HTTP_AUTHORIZATION'], $matches)) {
        return $matches[1];
    }
    // 3. Fallback to query parameter or body token
    if (!empty($_GET['token'])) {
        return trim($_GET['token']);
    }
    return null;
}

function getAuthUser($users) {
    $token = getBearerToken();
    if (!$token) return null;
    foreach ($users as $user) {
        if (isset($user['token']) && $user['token'] === $token) {
            return $user;
        }
    }
    return null;
}

function sendResponse($success, $data = null, $error = null, $code = 200) {
    http_response_code($code);
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error]);
    exit;
}

$action = $_GET['action'] ?? '';
$rawInput = file_get_contents('php://input');
if (empty($rawInput) && in_array(strtoupper($_SERVER['REQUEST_METHOD'] ?? ''), ['POST', 'PUT', 'PATCH'])) {
    if (php_sapi_name() === 'cli' && defined('STDIN') && function_exists('posix_isatty') && !posix_isatty(STDIN)) {
        $rawInput = @stream_get_contents(STDIN);
    }
}
$input = json_decode($rawInput ?? '', true) ?? [];

$users = loadJson($USERS_FILE, []);
$pets  = loadJson($PETS_FILE, []);
$tags  = loadJson($TAGS_FILE, []);
$scans = loadJson($SCANS_FILE, []);

// Synchronize existing pets with tags registry
$tagsModified = false;
foreach ($pets as $tId => $pData) {
    if (!isset($tags[$tId])) {
        $tags[$tId] = [
            'tagId' => $tId,
            'status' => 'claimed',
            'activationCode' => strtoupper(substr(bin2hex(random_bytes(3)), 0, 6)),
            'ownerId' => $pData['ownerId'] ?? 'demo',
            'updatedAt' => date('c')
        ];
        $tagsModified = true;
    }
}
if ($tagsModified) {
    saveJson($TAGS_FILE, $tags);
}

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// 1. PUBLIC: Get Pet by Tag ID (or Tag Status)
if ($action === 'get_pet') {
    $tag = strtoupper(trim($_GET['tag'] ?? ''));
    if (!$tag) sendResponse(false, null, 'Tag no especificado', 400);

    // If tag exists in tags registry as unclaimed
    if (isset($tags[$tag]) && ($tags[$tag]['status'] ?? '') === 'unclaimed') {
        sendResponse(true, [
            'status' => 'unclaimed',
            'tagId' => $tag
        ]);
    }

    // If tag is claimed and pet exists
    if (isset($pets[$tag])) {
        $petData = $pets[$tag];
        $petData['status'] = 'claimed';
        sendResponse(true, $petData);
    }

    // If tag is not registered yet, auto-provision it as an unclaimed tag with a new secret PIN!
    if (preg_match('/^[A-Z0-9\-]{3,24}$/', $tag)) {
        $newPin = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
        $tags[$tag] = [
            'tagId' => $tag,
            'status' => 'unclaimed',
            'activationCode' => $newPin,
            'createdAt' => date('c')
        ];
        saveJson($TAGS_FILE, $tags);

        sendResponse(true, [
            'status' => 'unclaimed',
            'tagId' => $tag
        ]);
    }

    sendResponse(false, null, 'Mascota no encontrada para este tag', 404);
}

// 1b. AUTH: Claim & Activate an Unclaimed Tag using Secret PIN
if ($action === 'claim_tag') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'Debés iniciar sesión o registrarte para activar tu collar', 401);

    $tagId = strtoupper(trim($input['tagId'] ?? ''));
    $pinInput = strtoupper(trim($input['activationCode'] ?? ''));
    $petData = $input['pet'] ?? [];

    if (!$tagId) sendResponse(false, null, 'Identificador de tag requerido', 400);
    if (!$pinInput) sendResponse(false, null, 'Ingresá el Código Secreto de Activación (PIN)', 400);

    // If tag doesn't exist yet, auto-provision
    if (!isset($tags[$tagId])) {
        $tags[$tagId] = [
            'tagId' => $tagId,
            'status' => 'unclaimed',
            'activationCode' => strtoupper(substr(bin2hex(random_bytes(3)), 0, 6)),
            'createdAt' => date('c')
        ];
        saveJson($TAGS_FILE, $tags);
    }

    $tagRecord = $tags[$tagId];

    // Check if already claimed by someone else
    if (($tagRecord['status'] ?? '') === 'claimed' && isset($tagRecord['ownerId']) && $tagRecord['ownerId'] !== $user['id']) {
        sendResponse(false, null, 'Este collar ya fue activado por otro usuario.', 400);
    }

    // Verify Secret Activation Code
    $expectedPin = strtoupper(trim($tagRecord['activationCode'] ?? ''));
    if ($expectedPin && $pinInput !== $expectedPin) {
        sendResponse(false, null, 'Código de Activación incorrecto. Verificá la tarjeta o caja del collar.', 403);
    }

    // Tag is valid! Create / update pet record
    $petRecord = array_merge($petData, [
        'tagId' => $tagId,
        'ownerId' => $user['id'],
        'ownerEmail' => $user['email'],
        'updatedAt' => date('c')
    ]);
    if (empty($petRecord['name'])) {
        $petRecord['name'] = 'Mi Mascota';
    }

    $pets[$tagId] = $petRecord;
    $tags[$tagId]['status'] = 'claimed';
    $tags[$tagId]['ownerId'] = $user['id'];
    $tags[$tagId]['claimedAt'] = date('c');

    saveJson($PETS_FILE, $pets);
    saveJson($TAGS_FILE, $tags);

    sendResponse(true, $petRecord);
}

// 1c. OWNER / DEMO: Reformat & Reset Tag to Unclaimed
if ($action === 'reset_tag') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'No autenticado', 401);

    $tagId = strtoupper(trim($input['tagId'] ?? ''));
    if (!$tagId) sendResponse(false, null, 'Identificador de tag requerido', 400);

    // Verify ownership or allow demo tag reset
    $isOwner = (isset($pets[$tagId]) && $pets[$tagId]['ownerId'] === $user['id']);
    $isDemoTag = ($tagId === 'PAW-NSH8MZ' || strpos($tagId, 'DEMO') !== false);
    
    if (!$isOwner && !$isDemoTag && isset($pets[$tagId])) {
        sendResponse(false, null, 'No tenés permisos para reformatear este tag', 403);
    }

    // Generate fresh secret activation PIN
    $newPin = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));

    // Remove pet from public profiles
    if (isset($pets[$tagId])) {
        unset($pets[$tagId]);
        saveJson($PETS_FILE, $pets);
    }

    // Reset tag in tags registry
    $tags[$tagId] = [
        'tagId' => $tagId,
        'status' => 'unclaimed',
        'activationCode' => $newPin,
        'resetBy' => $user['id'],
        'resetAt' => date('c')
    ];
    saveJson($TAGS_FILE, $tags);

    sendResponse(true, [
        'tagId' => $tagId,
        'status' => 'unclaimed',
        'activationCode' => $newPin,
        'message' => 'Medalla reformateada con éxito. Ahora está en estado VIRGEN/DESVINCULADA.'
    ]);
}

// 1d. OWNER: Get Tag Secret PIN
if ($action === 'get_tag_pin') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'No autenticado', 401);

    $tagId = strtoupper(trim($_GET['tagId'] ?? ''));
    if (!$tagId || !isset($tags[$tagId])) {
        sendResponse(false, null, 'Tag no encontrado', 404);
    }

    sendResponse(true, [
        'tagId' => $tagId,
        'status' => $tags[$tagId]['status'] ?? 'unclaimed',
        'activationCode' => $tags[$tagId]['activationCode'] ?? '------'
    ]);
}

// 2. AUTH: Register New Owner Account
if ($action === 'register') {
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';
    $name = trim($input['name'] ?? 'Dueño');

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendResponse(false, null, 'Ingresá un correo electrónico válido', 400);
    }
    if (strlen($password) < 4) {
        sendResponse(false, null, 'La contraseña debe tener al menos 4 caracteres', 400);
    }
    if (isset($users[$email])) {
        sendResponse(false, null, 'Ya existe una cuenta con este correo. Por favor iniciá sesión.', 400);
    }

    $token = bin2hex(random_bytes(32));
    $user = [
        'id' => 'usr_' . bin2hex(random_bytes(6)),
        'email' => $email,
        'name' => $name,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'token' => $token,
        'created_at' => date('c')
    ];

    $users[$email] = $user;
    saveJson($USERS_FILE, $users);

    sendResponse(true, [
        'id' => $user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'token' => $token
    ]);
}

// 3. AUTH: Login
if ($action === 'login') {
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';

    if (!isset($users[$email]) || !password_verify($password, $users[$email]['password_hash'])) {
        sendResponse(false, null, 'Correo o contraseña incorrectos', 401);
    }

    $token = bin2hex(random_bytes(32));
    $users[$email]['token'] = $token;
    saveJson($USERS_FILE, $users);

    sendResponse(true, [
        'id' => $users[$email]['id'],
        'email' => $users[$email]['email'],
        'name' => $users[$email]['name'],
        'token' => $token
    ]);
}

// 4. AUTH: Current User Session
if ($action === 'me') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'No autenticado', 401);
    sendResponse(true, [
        'id' => $user['id'],
        'email' => $user['email'],
        'name' => $user['name']
    ]);
}

// 5. OWNER: Get Owner's Pets
if ($action === 'get_owner_pets') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'No autenticado', 401);

    $ownerPets = [];
    foreach ($pets as $pet) {
        if (isset($pet['ownerId']) && $pet['ownerId'] === $user['id']) {
            $ownerPets[] = $pet;
        }
    }
    sendResponse(true, $ownerPets);
}

// 6. OWNER: Save (Create / Update) Pet
if ($action === 'save_pet') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'Debés iniciar sesión para registrar una mascota', 401);

    $petData = $input['pet'] ?? [];
    $tagId = strtoupper(trim($petData['tagId'] ?? ''));
    if (!$tagId) {
        $tagId = 'LAZO-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
    }

    // Check if tag is already taken by another owner
    if (isset($pets[$tagId]) && $pets[$tagId]['ownerId'] !== $user['id']) {
        sendResponse(false, null, 'Este código de tag ya pertenece a otra mascota', 400);
    }

    $record = array_merge($petData, [
        'tagId' => $tagId,
        'ownerId' => $user['id'],
        'ownerEmail' => $user['email'],
        'updatedAt' => date('c')
    ]);

    $pets[$tagId] = $record;
    if (!isset($tags[$tagId])) {
        $tags[$tagId] = [
            'tagId' => $tagId,
            'status' => 'claimed',
            'activationCode' => strtoupper(substr(bin2hex(random_bytes(3)), 0, 6)),
            'ownerId' => $user['id'],
            'claimedAt' => date('c'),
            'updatedAt' => date('c')
        ];
    } else {
        $tags[$tagId]['status'] = 'claimed';
        $tags[$tagId]['ownerId'] = $user['id'];
        $tags[$tagId]['claimedAt'] = $tags[$tagId]['claimedAt'] ?? date('c');
        $tags[$tagId]['updatedAt'] = date('c');
    }
    saveJson($PETS_FILE, $pets);
    saveJson($TAGS_FILE, $tags);

    sendResponse(true, $record);
}

// 7. OWNER: Delete Pet (Resets tag back to unclaimed so it can be reused)
if ($action === 'delete_pet') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'No autenticado', 401);

    $tagId = strtoupper(trim($input['tagId'] ?? ''));
    if (isset($pets[$tagId]) && $pets[$tagId]['ownerId'] === $user['id']) {
        unset($pets[$tagId]);
        saveJson($PETS_FILE, $pets);

        // Reset tag to unclaimed with a fresh PIN so collar can be re-assigned
        if (isset($tags[$tagId])) {
            $tags[$tagId]['status'] = 'unclaimed';
            $tags[$tagId]['activationCode'] = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
            unset($tags[$tagId]['ownerId']);
            unset($tags[$tagId]['claimedAt']);
            $tags[$tagId]['updatedAt'] = date('c');
            saveJson($TAGS_FILE, $tags);
        }

        sendResponse(true, ['deleted' => $tagId]);
    } else {
        sendResponse(false, null, 'Mascota no encontrada o no autorizada', 404);
    }
}

// 8. OWNER: Toggle Lost Mode
if ($action === 'toggle_lost') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'No autenticado', 401);

    $tagId = strtoupper(trim($input['tagId'] ?? ''));
    $isLost = (bool)($input['isLost'] ?? false);

    if (isset($pets[$tagId]) && $pets[$tagId]['ownerId'] === $user['id']) {
        $pets[$tagId]['isLost'] = $isLost;
        $pets[$tagId]['updatedAt'] = date('c');
        saveJson($PETS_FILE, $pets);
        sendResponse(true, ['tagId' => $tagId, 'isLost' => $isLost]);
    } else {
        sendResponse(false, null, 'Mascota no encontrada', 404);
    }
}

// 9. PUBLIC: Log Scan or GPS Ping
if ($action === 'log_scan') {
    $tagId = strtoupper(trim($input['tagId'] ?? 'GENERAL'));
    $logEntry = [
        'tagId' => $tagId,
        'location' => trim($input['location'] ?? 'Escaneo de Collar'),
        'method' => trim($input['method'] ?? 'NFC'),
        'coords' => trim($input['coords'] ?? ''),
        'timestamp' => date('c')
    ];

    array_unshift($scans, $logEntry);
    $scans = array_slice($scans, 0, 100);
    saveJson($SCANS_FILE, $scans);

    sendResponse(true, $logEntry);
}

// 10. OWNER: Get Scan Logs for a Pet
if ($action === 'get_scan_logs') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'No autenticado', 401);

    $tagId = strtoupper(trim($_GET['tagId'] ?? ''));
    $petLogs = [];
    foreach ($scans as $log) {
        if ($tagId && $log['tagId'] === $tagId) {
            $petLogs[] = $log;
        }
    }
    sendResponse(true, $petLogs);
}

sendResponse(false, null, 'Acción inválida', 400);
