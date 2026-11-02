<?php
/**
 * PawTag Production Backend API
 * Secure multi-pet storage & owner authentication for krealo.online/pawtag
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
    // Protect data directory from direct web browser access
    file_put_contents($DATA_DIR . '/.htaccess', "Deny from all\n");
}

$USERS_FILE = $DATA_DIR . '/users.json';
$PETS_FILE  = $DATA_DIR . '/pets.json';
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
    $headers = getallheaders();
    if (isset($headers['Authorization']) && preg_match('/Bearer\s(\S+)/', $headers['Authorization'], $matches)) {
        return $matches[1];
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
$input = json_decode(file_get_contents('php://input'), true) ?? [];

$users = loadJson($USERS_FILE, []);
$pets  = loadJson($PETS_FILE, []);
$scans = loadJson($SCANS_FILE, []);

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// 1. PUBLIC: Get Pet by Tag ID
if ($action === 'get_pet') {
    $tag = strtoupper(trim($_GET['tag'] ?? ''));
    if (!$tag) sendResponse(false, null, 'Tag no especificado', 400);

    if (isset($pets[$tag])) {
        sendResponse(true, $pets[$tag]);
    } else {
        sendResponse(false, null, 'Mascota no encontrada para este tag', 404);
    }
}

// 2. AUTH: Register New Owner Account
if ($action === 'register') {
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';
    $name = trim($input['name'] ?? 'Dueño');

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendResponse(false, null, 'Correo electrónico inválido', 400);
    }
    if (strlen($password) < 6) {
        sendResponse(false, null, 'La contraseña debe tener al menos 6 caracteres', 400);
    }
    if (isset($users[$email])) {
        sendResponse(false, null, 'Ya existe una cuenta con este correo', 400);
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
        $tagId = 'PAW-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
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
    saveJson($PETS_FILE, $pets);

    sendResponse(true, $record);
}

// 7. OWNER: Delete Pet
if ($action === 'delete_pet') {
    $user = getAuthUser($users);
    if (!$user) sendResponse(false, null, 'No autenticado', 401);

    $tagId = strtoupper(trim($input['tagId'] ?? ''));
    if (isset($pets[$tagId]) && $pets[$tagId]['ownerId'] === $user['id']) {
        unset($pets[$tagId]);
        saveJson($PETS_FILE, $pets);
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
    $scans = array_slice($scans, 0, 100); // keep last 100
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
