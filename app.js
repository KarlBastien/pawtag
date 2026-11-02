/**
 * PawTag - Real NFC Pet Collar Application Logic
 * Supports:
 * - Dual Mode: Public Finder View vs. Owner Admin Dashboard
 * - Web NFC API (Reading & Writing NDEF URL to physical tags)
 * - Geolocation API (Real GPS location capture and WhatsApp dispatch)
 * - Dynamic QR Code generation for collar tags
 * - Photo upload (File -> Base64 dataURL) & LocalStorage persistence
 * - Data Backup (JSON Export/Import) & Optional Admin PIN security
 */

// Default Pet Profile
const DEFAULT_PROFILE = {
    name: "Max",
    breed: "Golden Retriever",
    age: "3 años",
    gender: "Macho",
    photo: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&q=80&w=600",
    chipUid: "04:8A:3F:92:B1:80",
    vetMicrochip: "981098123456789", // Official 15-digit veterinary implant
    ownerName: "Carlos Bastien",
    phone: "+54 9 11 4567-8900",
    phone2: "+54 9 11 9876-5432",
    whatsapp: "5491145678900",
    city: "Buenos Aires, Argentina",
    vetClinic: "Veterinaria Central - Tel: +54 9 11 5555-4321",
    medicalNotes: "Alérgico al pollo. Castrado y vacunación séxtuple y antirrábica al día.",
    reward: "Recompensa económica por devolución segura.",
    isLost: false,
    adminPin: "", // Optional PIN to protect admin tab
    lastLocation: "Parque Centenario, Buenos Aires",
    lastTime: "Recién"
};

// Application State
let appState = {
    profile: { ...DEFAULT_PROFILE },
    scanLogs: [
        {
            time: "Hoy, 15:30",
            location: "Parque Centenario, Buenos Aires",
            coords: "-34.6037, -58.4382",
            method: "Toque NFC",
            status: "Normal"
        },
        {
            time: "Ayer, 09:15",
            location: "Plaza Las Heras, Palermo",
            coords: "-34.5842, -58.4011",
            method: "Lectura de Prueba",
            status: "Normal"
        }
    ],
    currentMode: 'finder' // 'finder' or 'admin'
};

// Storage Keys
const STORAGE_KEY = 'pawtag_data_v1';

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    initModeRouting();
    initPhotoUpload();
    renderAll();
    registerServiceWorker();
});

// PWA Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('PawTag Service Worker registrado:', reg.scope))
                .catch(err => console.log('Error registrando Service Worker:', err));
        });
    }
}

// Storage Management
function loadFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.profile) appState.profile = { ...DEFAULT_PROFILE, ...parsed.profile };
            if (parsed.scanLogs) appState.scanLogs = parsed.scanLogs;
        }
    } catch (e) {
        console.error("Error al cargar datos locales:", e);
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            profile: appState.profile,
            scanLogs: appState.scanLogs
        }));
    } catch (e) {
        console.error("Error al guardar datos locales:", e);
    }
}

// Mode & Route Handling
function initModeRouting() {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    // If explicit admin parameter or hash is present, or if stored
    if (urlParams.get('mode') === 'admin' || hash === '#admin') {
        appState.currentMode = 'admin';
    } else {
        // Default to finder view so anyone scanning the tag immediately sees pet emergency info
        appState.currentMode = 'finder';
    }
    applyModeView();
}

function setViewMode(mode) {
    if (mode === 'admin' && appState.profile.adminPin) {
        const enteredPin = prompt("Ingresá el PIN de Administrador (o dejá vacío si no configuraste):");
        if (enteredPin !== appState.profile.adminPin) {
            triggerToast("PIN incorrecto", "error");
            return;
        }
    }

    appState.currentMode = mode;
    if (mode === 'admin') {
        history.replaceState(null, '', '#admin');
    } else {
        history.replaceState(null, '', '#finder');
    }
    applyModeView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyModeView() {
    const finderView = document.getElementById('view-finder');
    const adminView = document.getElementById('view-admin');
    const bottomNav = document.getElementById('bottom-nav');
    const modeBadge = document.getElementById('header-mode-badge');

    if (appState.currentMode === 'finder') {
        finderView.classList.remove('hidden');
        adminView.classList.add('hidden');
        bottomNav.classList.add('hidden');
        if (modeBadge) {
            modeBadge.innerHTML = `<span class="bg-indigo-700/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full"><i class="fa-solid fa-eye mr-1"></i>Vista Pública</span>`;
        }
    } else {
        finderView.classList.add('hidden');
        adminView.classList.remove('hidden');
        bottomNav.classList.remove('hidden');
        if (modeBadge) {
            modeBadge.innerHTML = `<span class="bg-amber-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full"><i class="fa-solid fa-shield-halved mr-1"></i>Modo Dueño</span>`;
        }
    }
}

// Render UI Elements
function renderAll() {
    renderFinderView();
    renderAdminDashboard();
    renderProfileForm();
    renderNfcTools();
    renderQrSection();
    renderHistoryList();
}

// 1. Render Public Finder View (Seen when tag is tapped)
function renderFinderView() {
    const p = appState.profile;

    document.getElementById('finder-photo').src = p.photo;
    document.getElementById('finder-name').textContent = p.name;
    document.getElementById('finder-breed-age').textContent = `${p.breed} • ${p.age} • ${p.gender}`;
    document.getElementById('finder-owner-name').textContent = p.ownerName;
    document.getElementById('finder-city').textContent = p.city || "No especificada";
    document.getElementById('finder-medical').textContent = p.medicalNotes || "Sin datos médicos especiales.";
    document.getElementById('finder-chip-display').textContent = p.chipUid || "N/A";
    document.getElementById('finder-vet-microchip').textContent = p.vetMicrochip || "No registrado";

    // Primary Call Button
    const callBtn = document.getElementById('finder-call-btn');
    const cleanPhone = p.phone.replace(/[^0-9+]/g, '');
    callBtn.href = `tel:${cleanPhone}`;
    document.getElementById('finder-call-text').textContent = `Llamar a ${p.ownerName} (${p.phone})`;

    // Secondary Call Button
    const altCallBox = document.getElementById('finder-alt-phone-box');
    const altCallBtn = document.getElementById('finder-alt-call-btn');
    if (p.phone2 && p.phone2.trim() !== '') {
        altCallBox.classList.remove('hidden');
        altCallBtn.href = `tel:${p.phone2.replace(/[^0-9+]/g, '')}`;
        document.getElementById('finder-alt-call-text').textContent = `Teléfono Secundario: ${p.phone2}`;
    } else {
        altCallBox.classList.add('hidden');
    }

    // WhatsApp Button
    const waPhone = p.whatsapp ? p.whatsapp.replace(/[^0-9]/g, '') : cleanPhone.replace(/[^0-9]/g, '');
    const waText = encodeURIComponent(`¡Hola ${p.ownerName}! Acabo de encontrar a tu perro ${p.name}. Te escribo para coordinar y avisarte que está a salvo.`);
    const waBtn = document.getElementById('finder-whatsapp-btn');
    waBtn.href = `https://wa.me/${waPhone}?text=${waText}`;

    // Lost Mode Emergency Banner in Finder
    const finderHeader = document.getElementById('finder-header-banner');
    const finderBadge = document.getElementById('finder-status-badge');
    const finderAlertBox = document.getElementById('finder-lost-alert-box');
    const finderRewardBox = document.getElementById('finder-reward-box');
    const finderRewardText = document.getElementById('finder-reward-text');

    if (p.isLost) {
        finderHeader.className = "bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white p-6 text-center relative overflow-hidden shadow-xl";
        finderBadge.className = "inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-white text-rose-600 shadow-md animate-bounce";
        finderBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>¡ESTOY PERDIDO! AYÚDAME</span>`;
        finderAlertBox.classList.remove('hidden');

        if (p.reward && p.reward.trim() !== '') {
            finderRewardBox.classList.remove('hidden');
            finderRewardText.textContent = p.reward;
        } else {
            finderRewardBox.classList.add('hidden');
        }
    } else {
        finderHeader.className = "bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white p-6 text-center relative overflow-hidden shadow-xl";
        finderBadge.className = "inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-md";
        finderBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>Mascota con Hogar</span>`;
        finderAlertBox.classList.add('hidden');
        finderRewardBox.classList.add('hidden');
    }
}

// 2. Render Owner Admin Dashboard
function renderAdminDashboard() {
    const p = appState.profile;

    document.getElementById('dash-dog-name').textContent = p.name;
    document.getElementById('dash-dog-breed').textContent = `${p.breed} • ${p.age}`;
    document.getElementById('dash-dog-photo').src = p.photo;
    document.getElementById('dash-chip-uid').textContent = p.chipUid;
    document.getElementById('dash-location-text').textContent = p.lastLocation;
    document.getElementById('dash-last-time').textContent = p.lastTime;

    const lostBadge = document.getElementById('dash-status-badge');
    const lostBtn = document.getElementById('admin-toggle-lost-btn');
    const lostBtnText = document.getElementById('admin-lost-btn-text');
    const lostBanner = document.getElementById('admin-status-banner');
    const lostBannerTitle = document.getElementById('admin-banner-title');
    const lostBannerDesc = document.getElementById('admin-banner-desc');
    const lostBannerIcon = document.getElementById('admin-banner-icon');

    if (p.isLost) {
        lostBadge.textContent = "EXTRAVIADO";
        lostBadge.className = "absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-rose-600 text-white border-2 border-white shadow animate-pulse";

        lostBtn.className = "w-full md:w-auto px-5 py-2.5 bg-white text-rose-700 hover:bg-rose-50 font-bold rounded-xl shadow transition text-xs flex items-center justify-center space-x-2";
        lostBtnText.textContent = "Marcar como a Salvo";

        lostBanner.className = "bg-gradient-to-r from-rose-600 to-red-700 text-white rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between transition-all duration-300";
        lostBannerIcon.className = "fa-solid fa-triangle-exclamation text-rose-200 text-xl";
        lostBannerTitle.textContent = "🚨 ¡Alerta de Extravío Activa!";
        lostBannerDesc.textContent = "Cualquier persona que escanee el tag NFC verá carteles de emergencia en rojo, tu teléfono directo y solicitud de GPS.";
    } else {
        lostBadge.textContent = "SEGURO";
        lostBadge.className = "absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500 text-white border-2 border-white shadow";

        lostBtn.className = "w-full md:w-auto px-5 py-2.5 bg-white text-emerald-800 hover:bg-emerald-50 font-bold rounded-xl shadow transition text-xs flex items-center justify-center space-x-2";
        lostBtnText.textContent = "Activar Modo Extraviado";

        lostBanner.className = "bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between transition-all duration-300";
        lostBannerIcon.className = "fa-solid fa-shield-check text-emerald-100 text-xl";
        lostBannerTitle.textContent = "Mascota Segura en Casa";
        lostBannerDesc.textContent = "El tag NFC está en modo pasivo. Quien lo escanee verá la ficha informativa y tus datos de contacto.";
    }

    // Share URL field
    const publicUrl = getPublicFinderUrl();
    const shareInput = document.getElementById('dash-share-url');
    if (shareInput) shareInput.value = publicUrl;
}

// 3. Render Profile Form Values
function renderProfileForm() {
    const p = appState.profile;
    document.getElementById('form-name').value = p.name;
    document.getElementById('form-breed').value = p.breed;
    document.getElementById('form-age').value = p.age;
    document.getElementById('form-gender').value = p.gender || "Macho";
    document.getElementById('form-photo-url').value = p.photo;
    document.getElementById('form-photo-preview').src = p.photo;
    document.getElementById('form-chip-uid').value = p.chipUid;
    document.getElementById('form-vet-chip').value = p.vetMicrochip;
    document.getElementById('form-owner').value = p.ownerName;
    document.getElementById('form-phone').value = p.phone;
    document.getElementById('form-phone2').value = p.phone2 || "";
    document.getElementById('form-whatsapp').value = p.whatsapp || "";
    document.getElementById('form-city').value = p.city || "";
    document.getElementById('form-vet-clinic').value = p.vetClinic || "";
    document.getElementById('form-medical').value = p.medicalNotes || "";
    document.getElementById('form-reward').value = p.reward || "";
    document.getElementById('form-pin').value = p.adminPin || "";
}

// 4. Render NFC Tools
function renderNfcTools() {
    const statusPill = document.getElementById('nfc-support-pill');
    if (!statusPill) return;

    if ('NDEFReader' in window) {
        statusPill.innerHTML = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-circle-check mr-1.5"></i>Web NFC Compatible (Android Chrome)</span>`;
    } else {
        statusPill.innerHTML = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Web NFC no disponible en este navegador</span>`;
    }

    const targetUrlInput = document.getElementById('nfc-target-url');
    if (targetUrlInput) targetUrlInput.value = getPublicFinderUrl();
}

// 5. Render Dynamic QR Code
function renderQrSection() {
    const qrContainer = document.getElementById('qrcode-canvas');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';

    const publicUrl = getPublicFinderUrl();

    if (window.QRCode) {
        new QRCode(qrContainer, {
            text: publicUrl,
            width: 180,
            height: 180,
            colorDark: "#1e1b4b",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    } else {
        // Fallback using SVG generator API
        const encodedUrl = encodeURIComponent(publicUrl);
        qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodedUrl}&margin=5" alt="QR Code" class="w-44 h-44 rounded-lg shadow-sm" />`;
    }

    const shareUrlInput = document.getElementById('share-url-input');
    if (shareUrlInput) shareUrlInput.value = publicUrl;
}

// 6. Render History List
function renderHistoryList() {
    const listEl = document.getElementById('scan-history-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (appState.scanLogs.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">No hay registros de escaneos aún.</p>`;
        return;
    }

    appState.scanLogs.forEach(item => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs hover:bg-slate-100/70 transition";
        div.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-location-dot text-xs"></i>
                </div>
                <div>
                    <p class="font-bold text-slate-800">${escapeHtml(item.location)}</p>
                    <span class="text-[10px] text-slate-500">${escapeHtml(item.method)} • ${escapeHtml(item.time)} ${item.coords ? `• <a href="https://maps.google.com/?q=${item.coords}" target="_blank" class="text-indigo-600 underline font-mono">Ver mapa</a>` : ''}</span>
                </div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold ${item.status === 'Normal' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${escapeHtml(item.status)}</span>
        `;
        listEl.appendChild(div);
    });
}

// Helper: Public Finder URL
function getPublicFinderUrl() {
    const base = window.location.origin + window.location.pathname;
    return `${base}#finder`;
}

// Lost Mode Toggle
function toggleLostMode() {
    appState.profile.isLost = !appState.profile.isLost;
    saveToStorage();
    renderAll();

    if (appState.profile.isLost) {
        triggerToast("🚨 ¡Modo Extraviado Activado! La página mostrará alerta de emergencia roja a quien lo escanee.", "error");
    } else {
        triggerToast("🎉 ¡Mascota marcada como a salvo! Modo normal restaurado.", "success");
    }
}

// Real GPS Sharing from Finder
function shareFinderLocation() {
    const feedbackEl = document.getElementById('finder-gps-feedback');
    feedbackEl.classList.remove('hidden');
    feedbackEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Solicitando coordenadas GPS al dispositivo...`;

    if (!('geolocation' in navigator)) {
        feedbackEl.innerHTML = `<span class="text-rose-600"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Tu dispositivo no soporta geolocalización.</span>`;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);
            const accuracy = Math.round(position.coords.accuracy);
            const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Record in local log
            appState.profile.lastLocation = `Lat: ${lat}, Lng: ${lng} (Margen: ±${accuracy}m)`;
            appState.profile.lastTime = `Hoy, ${timeStr}`;
            appState.scanLogs.unshift({
                time: `Hoy, ${timeStr}`,
                location: `Ubicación GPS Reportada (±${accuracy}m)`,
                coords: `${lat},${lng}`,
                method: "GPS Compartido por Quien lo Encontró",
                status: appState.profile.isLost ? "¡ALERTA PERRO PERDIDO!" : "Aviso GPS"
            });
            saveToStorage();

            feedbackEl.innerHTML = `
                <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs space-y-2">
                    <p class="font-bold flex items-center"><i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i> ¡Ubicación GPS capturada con éxito!</p>
                    <p class="font-mono text-[11px] text-slate-600">Coordenadas: ${lat}, ${lng} (precisión ~${accuracy}m)</p>
                    <div class="pt-1 flex flex-col sm:flex-row gap-2">
                        <a href="https://wa.me/${appState.profile.whatsapp || appState.profile.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`¡Hola! Tengo a tu perro ${appState.profile.name}. Mi ubicación exacta en el mapa es: ${mapUrl}`)}" target="_blank" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-center flex items-center justify-center space-x-1 shadow-sm">
                            <i class="fa-brands fa-whatsapp text-sm"></i>
                            <span>Enviar Ubicación por WhatsApp</span>
                        </a>
                        <a href="sms:${appState.profile.phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Encontré a ${appState.profile.name}. Mi ubicación GPS es: ${mapUrl}`)}" class="px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold text-center flex items-center justify-center space-x-1 shadow-sm">
                            <i class="fa-solid fa-comment-sms text-sm"></i>
                            <span>Enviar por SMS</span>
                        </a>
                    </div>
                </div>
            `;
            triggerToast("📍 Ubicación GPS obtenida", "success");
        },
        (error) => {
            let msg = "No se pudo obtener la ubicación.";
            if (error.code === error.PERMISSION_DENIED) {
                msg = "Permiso de ubicación denegado en el navegador. Por favor permití el acceso a la ubicación.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                msg = "La señal de GPS no está disponible en este momento.";
            } else if (error.code === error.TIMEOUT) {
                msg = "Tiempo de espera agotado al obtener el GPS.";
            }
            feedbackEl.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i> ${msg}</div>`;
            triggerToast(msg, "error");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
}

// Real Web NFC API: Write Tag
async function writePublicUrlToNfc() {
    const statusBox = document.getElementById('nfc-writer-status');
    const targetUrl = getPublicFinderUrl();

    if (!('NDEFReader' in window)) {
        statusBox.classList.remove('hidden');
        statusBox.innerHTML = `
            <div class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
                <p class="font-bold"><i class="fa-solid fa-circle-info mr-1.5"></i> Web NFC no está disponible en este navegador</p>
                <p>Para programar el chip NFC con tu teléfono:</p>
                <ul class="list-disc list-inside space-y-0.5 text-slate-600 mt-1">
                    <li><strong>En Android:</strong> Usá Google Chrome. Abrí esta app y tocá "Programar Tag NFC".</li>
                    <li><strong>En iPhone:</strong> Descargá la app gratuita <strong>NFC Tools</strong> en la App Store. Seleccioná <em>Escribir -> Agregar un registro -> URL</em> y pegá tu enlace: <code class="font-mono bg-white px-1 py-0.5 rounded border">${targetUrl}</code></li>
                </ul>
            </div>
        `;
        return;
    }

    try {
        statusBox.classList.remove('hidden');
        statusBox.innerHTML = `
            <div class="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-xs text-center space-y-2 animate-pulse">
                <i class="fa-solid fa-wifi text-2xl text-indigo-600"></i>
                <p class="font-bold text-sm">Acercá el collar/tag NFC a la parte trasera de tu teléfono...</p>
                <p class="text-indigo-700">Manteniéndolo quieto durante 2 segundos mientras se graba la URL.</p>
            </div>
        `;

        const ndef = new NDEFReader();
        await ndef.write({
            records: [
                {
                    recordType: "url",
                    data: targetUrl
                }
            ]
        });

        statusBox.innerHTML = `
            <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs text-center space-y-1">
                <i class="fa-solid fa-circle-check text-2xl text-emerald-600"></i>
                <p class="font-bold text-sm">¡Tag NFC grabado con éxito!</p>
                <p class="text-slate-600">Ahora cualquier teléfono que toque este chip abrirá directamente la ficha de ${appState.profile.name}.</p>
            </div>
        `;
        triggerToast("🎉 ¡Chip NFC programado exitosamente!", "success");
    } catch (err) {
        statusBox.innerHTML = `
            <div class="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                <p class="font-bold"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i> Error al escribir en el tag NFC</p>
                <p class="text-rose-700 mt-0.5">${err.message}</p>
            </div>
        `;
        triggerToast("Error de NFC: " + err.message, "error");
    }
}

// Real Web NFC API: Read Tag
async function scanPhysicalNfcTag() {
    const statusBox = document.getElementById('nfc-writer-status');

    if (!('NDEFReader' in window)) {
        triggerToast("Web NFC no soportado en este dispositivo/navegador.", "error");
        return;
    }

    try {
        statusBox.classList.remove('hidden');
        statusBox.innerHTML = `
            <div class="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-xs text-center space-y-2 animate-pulse">
                <i class="fa-solid fa-mobile-screen text-2xl text-indigo-600"></i>
                <p class="font-bold text-sm">Acercá el tag NFC para leer su identificador...</p>
            </div>
        `;

        const ndef = new NDEFReader();
        await ndef.scan();

        ndef.onreading = (event) => {
            const serialNumber = event.serialNumber || "Desconocido";
            appState.profile.chipUid = serialNumber;
            document.getElementById('form-chip-uid').value = serialNumber;
            document.getElementById('dash-chip-uid').textContent = serialNumber;
            saveToStorage();

            statusBox.innerHTML = `
                <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs space-y-1">
                    <p class="font-bold"><i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i> ¡Tag NFC detectado!</p>
                    <p class="font-mono text-slate-700">UID: ${serialNumber}</p>
                </div>
            `;
            triggerToast(`Tag NFC detectado: ${serialNumber}`, "success");
        };

        ndef.onreadingerror = () => {
            triggerToast("No se pudo leer el tag NFC. Intentá de nuevo.", "error");
        };
    } catch (err) {
        triggerToast("Error al activar lector NFC: " + err.message, "error");
    }
}

// Simulation of Scan (Useful on Desktop / Non-NFC devices)
function simulateNfcScan() {
    const sampleZones = [
        "Plaza Las Heras, Recoleta",
        "Parque Rivadavia, Caballito",
        "Av. Libertador y Olleros, Belgrano",
        "Veterinaria 24hs, Palermo",
        "Plaza Vicente López, Retiro"
    ];
    const loc = sampleZones[Math.floor(Math.random() * sampleZones.length)];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    appState.profile.lastLocation = loc;
    appState.profile.lastTime = `Hoy, ${timeStr}`;
    appState.scanLogs.unshift({
        time: `Hoy, ${timeStr}`,
        location: loc,
        coords: "-34.5842, -58.4011",
        method: "Simulador de Toque NFC",
        status: appState.profile.isLost ? "¡ALERTA PERRO PERDIDO!" : "Normal"
    });

    saveToStorage();
    renderAll();

    if (appState.profile.isLost) {
        triggerToast(`🚨 ¡Tag escaneado en ${loc}! Modo perdido activo.`, "error");
    } else {
        triggerToast(`📲 Tag NFC escaneado en ${loc}`, "success");
    }
}

// Photo Upload Handler (Local file -> Data URL)
function initPhotoUpload() {
    const fileInput = document.getElementById('form-photo-file');
    const urlInput = document.getElementById('form-photo-url');
    const preview = document.getElementById('form-photo-preview');

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Compress / convert image to base64 DataURL
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;
                urlInput.value = dataUrl;
                preview.src = dataUrl;
                triggerToast("¡Foto cargada desde tu dispositivo!", "success");
            };
            reader.readAsDataURL(file);
        });
    }

    if (urlInput) {
        urlInput.addEventListener('input', () => {
            if (urlInput.value) {
                preview.src = urlInput.value;
            }
        });
    }
}

// Save Profile Form
function saveProfile(event) {
    event.preventDefault();

    const p = appState.profile;
    p.name = document.getElementById('form-name').value.trim();
    p.breed = document.getElementById('form-breed').value.trim();
    p.age = document.getElementById('form-age').value.trim();
    p.gender = document.getElementById('form-gender').value;
    p.photo = document.getElementById('form-photo-url').value.trim() || DEFAULT_PROFILE.photo;
    p.chipUid = document.getElementById('form-chip-uid').value.trim();
    p.vetMicrochip = document.getElementById('form-vet-chip').value.trim();
    p.ownerName = document.getElementById('form-owner').value.trim();
    p.phone = document.getElementById('form-phone').value.trim();
    p.phone2 = document.getElementById('form-phone2').value.trim();
    p.whatsapp = document.getElementById('form-whatsapp').value.trim();
    p.city = document.getElementById('form-city').value.trim();
    p.vetClinic = document.getElementById('form-vet-clinic').value.trim();
    p.medicalNotes = document.getElementById('form-medical').value.trim();
    p.reward = document.getElementById('form-reward').value.trim();
    p.adminPin = document.getElementById('form-pin').value.trim();

    saveToStorage();
    renderAll();
    switchTab('dashboard');
    triggerToast("¡Perfil guardado correctamente!", "success");
}

// Clear History
function clearHistory() {
    if (confirm("¿Estás seguro de que querés borrar el historial de escaneos?")) {
        appState.scanLogs = [];
        saveToStorage();
        renderHistoryList();
        triggerToast("Historial borrado", "success");
    }
}

// Copy URL
function copyShareUrl() {
    const url = getPublicFinderUrl();
    navigator.clipboard.writeText(url).then(() => {
        triggerToast("¡Enlace público copiado al portapapeles!", "success");
    }).catch(() => {
        const input = document.getElementById('share-url-input');
        if (input) {
            input.select();
            document.execCommand('copy');
            triggerToast("¡Enlace copiado!", "success");
        }
    });
}

// Print / Save Collar Tag
function printCollarCard() {
    window.print();
}

// Export Profile to JSON
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pawtag_${appState.profile.name.toLowerCase()}_backup.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    triggerToast("Copia de seguridad descargada", "success");
}

// Import Profile from JSON
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.profile) {
                appState.profile = { ...DEFAULT_PROFILE, ...imported.profile };
                if (imported.scanLogs) appState.scanLogs = imported.scanLogs;
                saveToStorage();
                renderAll();
                triggerToast("¡Datos restaurados con éxito!", "success");
            } else {
                throw new Error("Formato inválido");
            }
        } catch (err) {
            triggerToast("Error al importar archivo JSON: " + err.message, "error");
        }
    };
    reader.readAsText(file);
}

// Reset to Default
function resetDefaultData() {
    if (confirm("¿Restablecer datos a los valores de ejemplo por defecto? Se perderán los cambios no guardados.")) {
        appState.profile = { ...DEFAULT_PROFILE };
        saveToStorage();
        renderAll();
        triggerToast("Datos restablecidos a valores por defecto", "success");
    }
}

// Admin Tab Switching
function switchTab(tabId) {
    ['dashboard', 'profile', 'nfc', 'qr', 'settings'].forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        if (tabEl) tabEl.classList.add('hidden');
        const navBtn = document.getElementById(`nav-btn-${t}`);
        if (navBtn) {
            navBtn.classList.remove('text-indigo-600');
            navBtn.classList.add('text-slate-400');
        }
    });

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.classList.remove('hidden');

    const activeNav = document.getElementById(`nav-btn-${tabId}`);
    if (activeNav) {
        activeNav.classList.remove('text-slate-400');
        activeNav.classList.add('text-indigo-600');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Toast Notification
function triggerToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const title = document.getElementById('toast-title');
    const msg = document.getElementById('toast-message');
    const icon = document.getElementById('toast-icon');

    toast.className = `fixed top-4 right-4 z-50 max-w-sm w-full p-4 rounded-2xl shadow-xl border flex items-start space-x-3 transition-all duration-300 transform translate-y-0 ${
        type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
    }`;

    icon.innerHTML = type === 'error' ? '<i class="fa-solid fa-triangle-exclamation text-rose-600 text-xl"></i>' : '<i class="fa-solid fa-circle-check text-emerald-600 text-xl"></i>';
    title.textContent = type === 'error' ? 'Atención' : 'Éxito';
    msg.textContent = message;

    toast.classList.remove('hidden');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.classList.add('hidden');
}

// Safe HTML Escape
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}
