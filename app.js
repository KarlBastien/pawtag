/**
 * PawTag - Core Application Controller
 * Coordinates:
 * - Dynamic Tag Routing (?tag=TAG_ID) for Public Finders
 * - Owner Authentication & Multi-Pet Management (CRUD)
 * - Geolocation GPS Capture & WhatsApp/SMS Dispatch
 * - Web NFC Read & Write (NDEF URL)
 * - Dynamic QR Code Generation
 */

let currentScannedPet = null; // The pet being viewed by a finder
let activeAdminPet = null;    // The pet currently selected in owner dashboard
let ownerPetsList = [];       // List of all pets owned by logged-in user

// Initialize on Load
document.addEventListener('DOMContentLoaded', async () => {
    initAuthListeners();
    await routeApp();
    registerServiceWorker();
});

// PWA Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.log('SW registration note:', err.message);
        });
    }
}

// Router: Decide what to render based on URL and Auth
async function routeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    // Check for tag in query string (?tag=...) or hash (#tag=...)
    let tagId = urlParams.get('tag') || urlParams.get('id');
    if (!tagId && hash.startsWith('#tag=')) {
        tagId = hash.replace('#tag=', '');
    }

    if (tagId) {
        // Mode 1: Public Finder View for this specific dog
        await loadFinderViewForTag(tagId);
    } else if (window.pawDB.currentUser) {
        // Mode 2: Logged-in Owner Dashboard
        await loadOwnerDashboard();
    } else {
        // Mode 3: Public Portal / Welcome Screen
        loadPortalView();
    }
}

// -------------------------------------------------------------
// 1. PUBLIC FINDER VIEW (When a lost dog's tag is tapped/scanned)
// -------------------------------------------------------------
async function loadFinderViewForTag(tagId) {
    showView('view-finder');
    updateHeaderBadge('finder', tagId);

    const loader = document.getElementById('finder-loading');
    const content = document.getElementById('finder-content');
    const notFound = document.getElementById('finder-not-found');

    loader.classList.remove('hidden');
    content.classList.add('hidden');
    notFound.classList.add('hidden');

    try {
        const pet = await window.pawDB.getPetByTag(tagId);
        loader.classList.add('hidden');

        if (!pet) {
            notFound.classList.remove('hidden');
            document.getElementById('not-found-tag-id').textContent = tagId;
            return;
        }

        currentScannedPet = pet;
        renderFinderCard(pet);
        content.classList.remove('hidden');

        // Log this scan in the background
        window.pawDB.logScanEvent(tagId, {
            method: "Escaneo de Tag Público",
            location: "Acceso Web a Ficha de Mascota"
        });
    } catch (err) {
        loader.classList.add('hidden');
        notFound.classList.remove('hidden');
        document.getElementById('not-found-tag-id').textContent = tagId;
        console.error("Error al cargar mascota:", err);
    }
}

function renderFinderCard(pet) {
    document.getElementById('finder-photo').src = pet.photo || 'icons/icon-512.png';
    document.getElementById('finder-name').textContent = pet.name;
    document.getElementById('finder-breed-age').textContent = `${pet.breed || ''} • ${pet.age || ''} • ${pet.gender || ''}`;
    document.getElementById('finder-tag-pill').textContent = pet.tagId;
    document.getElementById('finder-owner-name').textContent = pet.ownerName || 'Dueño/a';
    document.getElementById('finder-city').textContent = pet.city || 'No especificada';
    document.getElementById('finder-medical').textContent = pet.medicalNotes || 'Sin datos médicos especiales.';
    document.getElementById('finder-vet-microchip').textContent = pet.vetMicrochip || 'No registrado';
    document.getElementById('finder-clinic').textContent = pet.vetClinic || 'No especificada';

    // Primary Phone Link
    const callBtn = document.getElementById('finder-call-btn');
    const cleanPhone = (pet.phone || '').replace(/[^0-9+]/g, '');
    callBtn.href = `tel:${cleanPhone}`;
    document.getElementById('finder-call-text').textContent = `Llamar a ${pet.ownerName || 'Dueño'} (${pet.phone || ''})`;

    // Secondary Phone Link
    const altBox = document.getElementById('finder-alt-phone-box');
    if (pet.phone2 && pet.phone2.trim() !== '') {
        altBox.classList.remove('hidden');
        document.getElementById('finder-alt-call-btn').href = `tel:${pet.phone2.replace(/[^0-9+]/g, '')}`;
        document.getElementById('finder-alt-call-text').textContent = `Teléfono Alternativo: ${pet.phone2}`;
    } else {
        altBox.classList.add('hidden');
    }

    // WhatsApp Direct Link
    const waPhone = (pet.whatsapp || cleanPhone).replace(/[^0-9]/g, '');
    const waText = encodeURIComponent(`¡Hola ${pet.ownerName || ''}! Acabo de escanear el collar de tu perro ${pet.name} (Tag: ${pet.tagId}). Te escribo para avisarte que lo tengo a salvo.`);
    document.getElementById('finder-whatsapp-btn').href = `https://wa.me/${waPhone}?text=${waText}`;

    // Lost Mode Emergency State
    const headerBanner = document.getElementById('finder-header-banner');
    const statusBadge = document.getElementById('finder-status-badge');
    const lostAlertBox = document.getElementById('finder-lost-alert-box');
    const rewardBox = document.getElementById('finder-reward-box');

    if (pet.isLost) {
        headerBanner.className = "bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white p-6 text-center relative overflow-hidden shadow-xl";
        statusBadge.className = "inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-white text-rose-600 shadow-md animate-bounce";
        statusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>¡ESTOY PERDIDO! AYÚDAME</span>`;
        lostAlertBox.classList.remove('hidden');

        if (pet.reward && pet.reward.trim() !== '') {
            rewardBox.classList.remove('hidden');
            document.getElementById('finder-reward-text').textContent = pet.reward;
        } else {
            rewardBox.classList.add('hidden');
        }
    } else {
        headerBanner.className = "bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white p-6 text-center relative overflow-hidden shadow-xl";
        statusBadge.className = "inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-md";
        statusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>Mascota Segura</span>`;
        lostAlertBox.classList.add('hidden');
        rewardBox.classList.add('hidden');
    }
}

// Real GPS Sharing by Finder
function shareFinderLocation() {
    if (!currentScannedPet) return;
    const feedback = document.getElementById('finder-gps-feedback');
    feedback.classList.remove('hidden');
    feedback.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5 text-indigo-600"></i> Obteniendo ubicación GPS precisa...`;

    if (!('geolocation' in navigator)) {
        feedback.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">Tu navegador no soporta geolocalización.</div>`;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            const acc = Math.round(pos.coords.accuracy);
            const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            window.pawDB.logScanEvent(currentScannedPet.tagId, {
                method: "GPS Compartido por Quien lo Encontró",
                location: `Lat: ${lat}, Lng: ${lng} (±${acc}m)`,
                coords: `${lat},${lng}`
            });

            const waPhone = (currentScannedPet.whatsapp || currentScannedPet.phone).replace(/[^0-9]/g, '');
            const waMsg = encodeURIComponent(`¡Hola! Tengo a tu perro ${currentScannedPet.name}. Mi ubicación GPS exacta en el mapa es: ${mapUrl}`);

            feedback.innerHTML = `
                <div class="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs space-y-2 mt-2">
                    <p class="font-bold flex items-center"><i class="fa-solid fa-circle-check text-emerald-600 text-sm mr-1.5"></i> ¡Coordenadas GPS obtenidas!</p>
                    <p class="text-[11px] font-mono text-slate-600">Lat: ${lat}, Lng: ${lng} (Precisión: ±${acc}m)</p>
                    <div class="pt-1 flex flex-col gap-2">
                        <a href="https://wa.me/${waPhone}?text=${waMsg}" target="_blank" class="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-center flex items-center justify-center space-x-1.5 shadow-sm">
                            <i class="fa-brands fa-whatsapp text-base"></i>
                            <span>Enviar Ubicación por WhatsApp al Dueño</span>
                        </a>
                        <a href="sms:${(currentScannedPet.phone || '').replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Encontré a ${currentScannedPet.name}. Mi ubicación GPS es: ${mapUrl}`)}" class="w-full py-2 px-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-semibold text-center flex items-center justify-center space-x-1.5">
                            <i class="fa-solid fa-comment-sms"></i>
                            <span>Enviar por SMS</span>
                        </a>
                    </div>
                </div>
            `;
            triggerToast("📍 Coordenadas GPS obtenidas con éxito", "success");
        },
        (err) => {
            let msg = "No se pudo obtener la ubicación.";
            if (err.code === err.PERMISSION_DENIED) {
                msg = "Permiso de ubicación denegado en tu navegador.";
            }
            feedback.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">${msg}</div>`;
            triggerToast(msg, "error");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// -------------------------------------------------------------
// 2. OWNER ADMIN DASHBOARD (When logged in)
// -------------------------------------------------------------
async function loadOwnerDashboard() {
    showView('view-admin');
    updateHeaderBadge('owner');

    const user = window.pawDB.currentUser;
    document.getElementById('header-user-email').textContent = user.email || user.name || "Dueño";

    ownerPetsList = await window.pawDB.getPetsByOwner();

    const emptyBox = document.getElementById('owner-empty-state');
    const contentBox = document.getElementById('owner-pet-content');

    if (ownerPetsList.length === 0) {
        activeAdminPet = null;
        if (emptyBox) emptyBox.classList.remove('hidden');
        if (contentBox) contentBox.classList.add('hidden');
        renderPetSelector();
        return;
    }

    if (emptyBox) emptyBox.classList.add('hidden');
    if (contentBox) contentBox.classList.remove('hidden');

    if (!activeAdminPet || !ownerPetsList.find(p => p.tagId === activeAdminPet.tagId)) {
        activeAdminPet = ownerPetsList[0];
    }

    renderPetSelector();
    await renderActivePetDashboard();
}

function renderPetSelector() {
    const selector = document.getElementById('pet-selector-dropdown');
    selector.innerHTML = '';

    ownerPetsList.forEach(pet => {
        const option = document.createElement('option');
        option.value = pet.tagId;
        option.textContent = `${pet.name} (${pet.tagId})${pet.isLost ? ' 🚨 ¡PERDIDO!' : ''}`;
        if (activeAdminPet && pet.tagId === activeAdminPet.tagId) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
}

async function onPetSelectChange(event) {
    const selectedTag = event.target.value;
    activeAdminPet = ownerPetsList.find(p => p.tagId === selectedTag);
    await renderActivePetDashboard();
}

async function renderActivePetDashboard() {
    if (!activeAdminPet) return;
    const pet = activeAdminPet;

    // Header Hero
    document.getElementById('dash-pet-name').textContent = pet.name;
    document.getElementById('dash-pet-breed').textContent = `${pet.breed} • ${pet.age}`;
    document.getElementById('dash-pet-photo').src = pet.photo;
    document.getElementById('dash-pet-tag').textContent = pet.tagId;

    // Lost Mode Card & Button
    const banner = document.getElementById('admin-lost-banner');
    const badge = document.getElementById('dash-status-badge');
    const btnText = document.getElementById('admin-lost-btn-text');

    if (pet.isLost) {
        badge.textContent = "EXTRAVIADO";
        badge.className = "absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-rose-600 text-white border-2 border-white shadow animate-pulse";
        banner.className = "bg-gradient-to-r from-rose-600 to-red-700 text-white rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between transition gap-4";
        document.getElementById('admin-banner-title').textContent = "🚨 ¡Alerta de Extravío Activa!";
        document.getElementById('admin-banner-desc').textContent = `Quien escanee el collar de ${pet.name} verá de inmediato la alerta roja de emergencia y tus botones de llamada.`;
        btnText.textContent = "Marcar como a Salvo";
    } else {
        badge.textContent = "SEGURO";
        badge.className = "absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500 text-white border-2 border-white shadow";
        banner.className = "bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between transition gap-4";
        document.getElementById('admin-banner-title').textContent = "Mascota Segura en Casa";
        document.getElementById('admin-banner-desc').textContent = `El tag de ${pet.name} está en modo pasivo. Quien lo toque verá la ficha informativa y tus contactos.`;
        btnText.textContent = "Activar Modo Extraviado";
    }

    // Public Link
    const publicUrl = getPetPublicUrl(pet.tagId);
    document.getElementById('admin-pet-public-url').value = publicUrl;

    // Populate Edit Form
    populateEditForm(pet);

    // Render NFC & QR tools for this specific pet
    renderNfcTools(pet);
    renderQrCode(pet);
    await renderScanLogs(pet.tagId);
}

function getPetPublicUrl(tagId) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?tag=${encodeURIComponent(tagId)}`;
}

async function toggleActivePetLostMode() {
    if (!activeAdminPet) return;
    const newStatus = !activeAdminPet.isLost;
    await window.pawDB.setLostMode(activeAdminPet.tagId, newStatus);
    activeAdminPet.isLost = newStatus;

    // Update in ownerPetsList
    const idx = ownerPetsList.findIndex(p => p.tagId === activeAdminPet.tagId);
    if (idx !== -1) ownerPetsList[idx].isLost = newStatus;

    renderPetSelector();
    renderActivePetDashboard();

    if (newStatus) {
        triggerToast(`🚨 ¡Modo Extraviado Activado para ${activeAdminPet.name}!`, "error");
    } else {
        triggerToast(`🎉 ¡${activeAdminPet.name} marcada como a salvo!`, "success");
    }
}

function openAddNewPetModal() {
    activeAdminPet = null;
    const emptyBox = document.getElementById('owner-empty-state');
    const contentBox = document.getElementById('owner-pet-content');
    if (emptyBox) emptyBox.classList.add('hidden');
    if (contentBox) contentBox.classList.remove('hidden');

    document.getElementById('form-pet-tag').value = "PAW-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    document.getElementById('form-pet-name').value = "";
    document.getElementById('form-pet-breed').value = "";
    document.getElementById('form-pet-age').value = "";
    document.getElementById('form-pet-gender').value = "Macho";
    document.getElementById('form-pet-photo-url').value = "";
    document.getElementById('form-pet-photo-preview').src = "icons/icon-512.png";
    document.getElementById('form-vet-chip').value = "";
    document.getElementById('form-pet-owner').value = window.pawDB.currentUser ? (window.pawDB.currentUser.name || "") : "";
    document.getElementById('form-pet-phone').value = "";
    document.getElementById('form-pet-phone2').value = "";
    document.getElementById('form-pet-whatsapp').value = "";
    document.getElementById('form-pet-city').value = "";
    document.getElementById('form-pet-clinic').value = "";
    document.getElementById('form-pet-medical').value = "";
    document.getElementById('form-pet-reward').value = "";

    const delBtn = document.getElementById('form-delete-pet-btn');
    if (delBtn) delBtn.classList.add('hidden');

    switchAdminTab('profile');
    document.getElementById('form-pet-name').focus();
    triggerToast("Completá los datos de tu perro", "success");
}

function populateEditForm(pet) {
    document.getElementById('form-pet-tag').value = pet.tagId;
    document.getElementById('form-pet-name').value = pet.name || "";
    document.getElementById('form-pet-breed').value = pet.breed || "";
    document.getElementById('form-pet-age').value = pet.age || "";
    document.getElementById('form-pet-gender').value = pet.gender || "Macho";
    document.getElementById('form-pet-photo-url').value = pet.photo || "";
    document.getElementById('form-pet-photo-preview').src = pet.photo || "";
    document.getElementById('form-vet-chip').value = pet.vetMicrochip || "";
    document.getElementById('form-pet-owner').value = pet.ownerName || "";
    document.getElementById('form-pet-phone').value = pet.phone || "";
    document.getElementById('form-pet-phone2').value = pet.phone2 || "";
    document.getElementById('form-pet-whatsapp').value = pet.whatsapp || "";
    document.getElementById('form-pet-city').value = pet.city || "";
    document.getElementById('form-pet-clinic').value = pet.vetClinic || "";
    document.getElementById('form-pet-medical').value = pet.medicalNotes || "";
    document.getElementById('form-pet-reward').value = pet.reward || "";

    const delBtn = document.getElementById('form-delete-pet-btn');
    if (delBtn) delBtn.classList.remove('hidden');
}

async function savePetProfile(event) {
    event.preventDefault();

    const tagId = document.getElementById('form-pet-tag').value.trim().toUpperCase();
    const petData = {
        tagId,
        name: document.getElementById('form-pet-name').value.trim(),
        breed: document.getElementById('form-pet-breed').value.trim(),
        age: document.getElementById('form-pet-age').value.trim(),
        gender: document.getElementById('form-pet-gender').value,
        photo: document.getElementById('form-pet-photo-url').value.trim() || 'icons/icon-512.png',
        vetMicrochip: document.getElementById('form-vet-chip').value.trim(),
        ownerName: document.getElementById('form-pet-owner').value.trim(),
        phone: document.getElementById('form-pet-phone').value.trim(),
        phone2: document.getElementById('form-pet-phone2').value.trim(),
        whatsapp: document.getElementById('form-pet-whatsapp').value.trim(),
        city: document.getElementById('form-pet-city').value.trim(),
        vetClinic: document.getElementById('form-pet-clinic').value.trim(),
        medicalNotes: document.getElementById('form-pet-medical').value.trim(),
        reward: document.getElementById('form-pet-reward').value.trim(),
        isLost: activeAdminPet ? activeAdminPet.isLost : false
    };

    try {
        const saved = await window.pawDB.savePet(petData);
        activeAdminPet = saved;
        ownerPetsList = await window.pawDB.getPetsByOwner();
        renderPetSelector();
        await renderActivePetDashboard();
        switchAdminTab('dashboard');
        triggerToast("¡Mascota guardada con éxito!", "success");
    } catch (err) {
        triggerToast("Error al guardar: " + err.message, "error");
    }
}

async function deleteActivePet() {
    if (!activeAdminPet) return;
    const petName = activeAdminPet.name || 'esta mascota';
    const tagId = activeAdminPet.tagId;
    if (!confirm(`¿Estás seguro de que querés eliminar la ficha de ${petName} (${tagId})?\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        await window.pawDB.deletePet(tagId);
        triggerToast(`Ficha de ${petName} eliminada correctamente`, "success");
        await loadOwnerDashboard();
    } catch (err) {
        triggerToast("Error al eliminar: " + err.message, "error");
    }
}

// -------------------------------------------------------------
// 3. NFC & QR TOOLS
// -------------------------------------------------------------
function renderNfcTools(pet) {
    const pill = document.getElementById('nfc-support-pill');
    if (!pill) return;

    if ('NDEFReader' in window) {
        pill.innerHTML = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-circle-check mr-1.5"></i>Web NFC Compatible (Chrome Android)</span>`;
    } else {
        pill.innerHTML = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"><i class="fa-solid fa-circle-info mr-1.5"></i>Web NFC no disponible en este navegador</span>`;
    }

    const publicUrl = getPetPublicUrl(pet.tagId);
    document.getElementById('nfc-target-url').value = publicUrl;
}

let nfcAbortController = null;
let nfcWaitingTimer = null;

function cancelNfcWrite() {
    if (nfcWaitingTimer) {
        clearTimeout(nfcWaitingTimer);
        nfcWaitingTimer = null;
    }
    if (nfcAbortController) {
        try { nfcAbortController.abort(); } catch(e){}
        nfcAbortController = null;
    }
    const statusBox = document.getElementById('nfc-writer-status');
    if (statusBox) statusBox.classList.add('hidden');
    triggerToast("Operación NFC cancelada", "info");
}

async function writeActivePetToNfc() {
    if (!activeAdminPet) return;
    const statusBox = document.getElementById('nfc-writer-status');
    const targetUrl = getPetPublicUrl(activeAdminPet.tagId);

    if (!('NDEFReader' in window)) {
        statusBox.classList.remove('hidden');
        statusBox.innerHTML = `
            <div class="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-2.5">
                <p class="font-bold flex items-center text-sm"><i class="fa-solid fa-circle-info mr-2 text-amber-600"></i> Web NFC no disponible en este dispositivo/navegador</p>
                <p class="text-slate-600 leading-relaxed">
                    Las computadoras (Mac/PC) y los navegadores de iPhone no permiten escribir directamente en chips NFC.
                </p>
                <p class="font-semibold text-slate-800">Para grabar tu medalla NTAG216:</p>
                <div class="p-2.5 bg-white rounded-xl border border-amber-200 font-mono text-[11px] flex items-center justify-between">
                    <span class="truncate mr-2">${targetUrl}</span>
                    <button onclick="copyText('nfc-target-url')" class="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded font-sans font-bold text-[10px] shrink-0">Copiar</button>
                </div>
                <div class="pt-1">
                    <button onclick="openNfcTroubleshootModal()" class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition">
                        Ver Guía Paso a Paso para iPhone y Android
                    </button>
                </div>
            </div>
        `;
        return;
    }

    try {
        if (nfcAbortController) {
            try { nfcAbortController.abort(); } catch(e){}
        }
        nfcAbortController = new AbortController();
        if (nfcWaitingTimer) clearTimeout(nfcWaitingTimer);
        nfcWaitingTimer = setTimeout(() => {
            const tipBox = document.getElementById('nfc-waiting-tip');
            if (tipBox) {
                tipBox.innerHTML = `
                    <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-amber-900 text-xs space-y-2">
                        <p class="font-bold flex items-center text-xs">
                            <i class="fa-solid fa-circle-question mr-1.5 text-amber-600"></i> ¿Tu chip es nuevo de fábrica (en blanco)?
                        </p>
                        <p class="text-[11px] text-slate-600 leading-relaxed">
                            Los chips recién comprados vienen con memoria virgen sin formato NDEF. Los navegadores web no tienen permisos del sistema operativo para formatear chips vírgenes desde cero.
                        </p>
                        <p class="text-[11px] font-semibold text-slate-700">
                            <strong>Solución rápida (5 seg):</strong> Abrí la app gratuita <strong>NFC Tools</strong> en tu Android ➔ <em>Escribir ➔ Agregar registro ➔ URL</em> ➔ pegá el enlace de Kiwi y apoyá el chip. ¡Queda listo para siempre!
                        </p>
                    </div>
                `;
            }
        }, 6000);

        statusBox.classList.remove('hidden');
        statusBox.innerHTML = `
            <div class="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-900 text-xs text-center space-y-3">
                <i class="fa-solid fa-wifi text-3xl text-indigo-600 animate-pulse"></i>
                <div>
                    <p class="font-bold text-sm">Esperando medalla NFC...</p>
                    <p class="text-slate-600 mt-1">Apoyá la medalla firmemente contra la parte trasera de tu teléfono (junto a las cámaras o en el centro).</p>
                </div>
                <div id="nfc-waiting-tip"></div>
                <div>
                    <button onclick="cancelNfcWrite()" class="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-xl font-semibold border border-slate-200 shadow-sm transition">
                        Cancelar
                    </button>
                </div>
            </div>
        `;

        const ndef = new NDEFReader();
        await ndef.write({
            records: [{ recordType: "url", data: targetUrl }]
        }, { signal: nfcAbortController.signal });

        if (nfcWaitingTimer) {
            clearTimeout(nfcWaitingTimer);
            nfcWaitingTimer = null;
        }

        statusBox.innerHTML = `
            <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs text-center space-y-1">
                <i class="fa-solid fa-circle-check text-3xl text-emerald-600"></i>
                <p class="font-bold text-sm">¡Chip grabado exitosamente!</p>
                <p class="text-slate-600">Cualquier celular que toque este collar abrirá de inmediato la ficha de ${activeAdminPet.name}.</p>
            </div>
        `;
        triggerToast("🎉 ¡Tag grabado con éxito!", "success");
    } catch (err) {
        if (nfcWaitingTimer) {
            clearTimeout(nfcWaitingTimer);
            nfcWaitingTimer = null;
        }
        if (err.name === 'AbortError') return;
        statusBox.innerHTML = `
            <div class="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs space-y-2">
                <p class="font-bold"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i> No se pudo grabar el chip: ${err.message}</p>
                <p class="text-[11px] text-slate-600">Verificá que el NFC de tu teléfono esté encendido en Ajustes y que la funda del celular no sea metálica o magnética.</p>
                <button onclick="openNfcTroubleshootModal()" class="text-indigo-600 font-bold underline text-[11px]">
                    Ver soluciones frecuentes
                </button>
            </div>
        `;
        triggerToast("Error de NFC: " + err.message, "error");
    }
}

function renderQrCode(pet) {
    const container = document.getElementById('qrcode-canvas');
    if (!container) return;
    container.innerHTML = '';

    const publicUrl = getPetPublicUrl(pet.tagId);
    if (window.QRCode) {
        new QRCode(container, {
            text: publicUrl,
            width: 170,
            height: 170,
            colorDark: "#1e1b4b",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    } else {
        container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(publicUrl)}" alt="QR" class="w-40 h-40 rounded-xl" />`;
    }
    document.getElementById('qr-share-url').value = publicUrl;
}

async function renderScanLogs(tagId) {
    const list = document.getElementById('scan-history-list');
    if (!list) return;
    list.innerHTML = '';

    try {
        const logs = await window.pawDB.getScanLogs(tagId);
        if (!Array.isArray(logs) || logs.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">No hay registros de escaneos aún.</p>`;
            return;
        }

        logs.forEach(log => {
            const div = document.createElement('div');
            div.className = "flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs";
            div.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-location-dot text-xs"></i>
                    </div>
                    <div>
                        <p class="font-bold text-slate-800">${escapeHtml(log.location || 'Escaneo')}</p>
                        <span class="text-[10px] text-slate-400">${escapeHtml(log.method || 'NFC')} • ${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
                ${log.coords ? `<a href="https://maps.google.com/?q=${log.coords}" target="_blank" class="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-[10px]">Ver mapa</a>` : ''}
            `;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">No hay registros de escaneos aún.</p>`;
    }
}

// -------------------------------------------------------------
// 4. PORTAL / LANDING VIEW (When opening site root without tag)
// -------------------------------------------------------------
function loadPortalView() {
    showView('view-portal');
    updateHeaderBadge('portal');
}

function searchTagFromPortal() {
    const input = document.getElementById('portal-tag-input');
    const tag = input.value.trim().toUpperCase();
    if (!tag) {
        triggerToast("Ingresá un código de tag", "error");
        return;
    }
    window.location.search = `?tag=${encodeURIComponent(tag)}`;
}

// -------------------------------------------------------------
// 5. AUTHENTICATION CONTROLLER
// -------------------------------------------------------------
function initAuthListeners() {
    window.onAuthChanged = (user) => {
        if (user) {
            document.getElementById('header-auth-btn-text').textContent = "Mi Cuenta";
        } else {
            document.getElementById('header-auth-btn-text').textContent = "Iniciar Sesión";
        }
    };

    // Photo input listener
    const photoFile = document.getElementById('form-pet-photo-file');
    const photoUrl = document.getElementById('form-pet-photo-url');
    const preview = document.getElementById('form-pet-photo-preview');

    if (photoFile) {
        photoFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 800;
                    let width = img.width;
                    let height = img.height;
                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height = Math.round(height * (MAX_SIZE / width));
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width = Math.round(width * (MAX_SIZE / height));
                            height = MAX_SIZE;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressed = canvas.toDataURL('image/jpeg', 0.85);
                    photoUrl.value = compressed;
                    preview.src = compressed;
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    if (photoUrl) {
        photoUrl.addEventListener('input', () => {
            if (photoUrl.value) preview.src = photoUrl.value;
        });
    }
}

function openAuthModal() {
    if (window.pawDB.currentUser) {
        // Already logged in, go to dashboard
        loadOwnerDashboard();
        return;
    }
    document.getElementById('auth-modal').classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function switchAuthTab(type) {
    const isLogin = type === 'login';
    document.getElementById('auth-tab-login').className = isLogin ? "flex-1 py-2 font-bold text-xs border-b-2 border-indigo-600 text-indigo-600" : "flex-1 py-2 font-medium text-xs text-slate-400";
    document.getElementById('auth-tab-signup').className = !isLogin ? "flex-1 py-2 font-bold text-xs border-b-2 border-indigo-600 text-indigo-600" : "flex-1 py-2 font-medium text-xs text-slate-400";
    document.getElementById('auth-signup-fields').classList.toggle('hidden', isLogin);
    document.getElementById('auth-submit-btn-text').textContent = isLogin ? "Ingresar a mi Cuenta" : "Crear mi Cuenta";
    document.getElementById('auth-form').dataset.mode = type;
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const mode = document.getElementById('auth-form').dataset.mode || 'login';
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim() || 'Dueño';
    const submitBtn = document.getElementById('auth-submit-btn-text');

    const origText = submitBtn.textContent;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Procesando...`;

    try {
        if (mode === 'signup') {
            await window.pawDB.signUp(email, password, name);
            triggerToast("¡Cuenta creada con éxito! Bienvenido/a", "success");
        } else {
            await window.pawDB.signIn(email, password);
            triggerToast("¡Sesión iniciada correctamente!", "success");
        }
        closeAuthModal();
        window.history.replaceState(null, '', window.location.pathname);
        await loadOwnerDashboard();
    } catch (err) {
        triggerToast(err.message, "error");
    } finally {
        submitBtn.textContent = origText;
    }
}

async function handleSignOut() {
    if (confirm("¿Cerrar sesión de dueño?")) {
        window.pawDB.signOut();
        triggerToast("Sesión cerrada", "success");
        window.location.search = "";
    }
}

// Bottom Nav Handler: Route or explain feature
function handleBottomNavClick(tab) {
    if (tab === 'dashboard') {
        if (window.pawDB.currentUser) {
            switchAdminTab('dashboard');
        } else {
            showView('view-portal');
        }
        return;
    }

    if (!window.pawDB.currentUser) {
        openFeatureInfoModal(tab);
        return;
    }

    if (tab === 'profile' && (!ownerPetsList || ownerPetsList.length === 0)) {
        openAddNewPetModal();
        return;
    }

    switchAdminTab(tab);
}

function openFeatureInfoModal(tab) {
    const modal = document.getElementById('feature-info-modal');
    const icon = document.getElementById('feature-info-icon');
    const title = document.getElementById('feature-info-title');
    const desc = document.getElementById('feature-info-desc');

    if (tab === 'profile') {
        icon.className = "w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-3xl shadow-sm bg-indigo-50 text-indigo-600";
        icon.innerHTML = `<i class="fa-solid fa-dog"></i>`;
        title.textContent = "Ficha Digital de Mascota";
        desc.textContent = "La ficha almacena el nombre, foto, teléfonos de contacto, WhatsApp directo, clínica veterinaria y notas médicas de tu perro. Cuando alguien escanee su medalla, verá estos datos al instante para ayudarte a recuperarlo.";
    } else if (tab === 'nfc') {
        icon.className = "w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-3xl shadow-sm bg-emerald-50 text-emerald-600";
        icon.innerHTML = `<i class="fa-solid fa-microchip"></i>`;
        title.textContent = "Programador de Medalla NFC";
        desc.textContent = "Te permite grabar tu medalla inteligente NTAG216 con el perfil de tu perro con un solo toque desde tu teléfono. Cualquier celular moderno podrá leer la medalla automáticamente sin apps.";
    } else if (tab === 'qr') {
        icon.className = "w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-3xl shadow-sm bg-purple-50 text-purple-600";
        icon.innerHTML = `<i class="fa-solid fa-qrcode"></i>`;
        title.textContent = "Código QR de Respaldo";
        desc.textContent = "Genera un código QR de alta resolución con el enlace directo a la ficha de tu mascota para imprimirlo en una tarjeta de respaldo o mandarlo a grabar en la placa del collar.";
    }

    modal.classList.remove('hidden');
}

function closeFeatureInfoModal() {
    document.getElementById('feature-info-modal').classList.add('hidden');
}

// -------------------------------------------------------------
// 6. MODALS & UI HELPERS
// -------------------------------------------------------------
function openNfcTroubleshootModal() {
    document.getElementById('nfc-help-modal').classList.remove('hidden');
}

function closeNfcTroubleshootModal() {
    document.getElementById('nfc-help-modal').classList.add('hidden');
}

function showView(viewId) {
    ['view-finder', 'view-admin', 'view-portal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== viewId);
    });
}

function switchAdminTab(tabId) {
    const emptyBox = document.getElementById('owner-empty-state');
    const contentBox = document.getElementById('owner-pet-content');

    if (!ownerPetsList || ownerPetsList.length === 0) {
        if (tabId === 'profile') {
            if (emptyBox) emptyBox.classList.add('hidden');
            if (contentBox) contentBox.classList.remove('hidden');
        } else {
            if (tabId === 'nfc' || tabId === 'qr') {
                triggerToast("Primero registrá los datos de tu mascota", "info");
                openAddNewPetModal();
                return;
            }
            if (emptyBox) emptyBox.classList.remove('hidden');
            if (contentBox) contentBox.classList.add('hidden');
            ['dashboard', 'profile', 'nfc', 'qr'].forEach(t => {
                const navBtn = document.getElementById(`nav-btn-${t}`);
                if (navBtn) {
                    navBtn.classList.toggle('text-indigo-600', t === 'dashboard');
                    navBtn.classList.toggle('text-slate-400', t !== 'dashboard');
                }
            });
            return;
        }
    } else {
        if (emptyBox) emptyBox.classList.add('hidden');
        if (contentBox) contentBox.classList.remove('hidden');
    }

    ['dashboard', 'profile', 'nfc', 'qr'].forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        if (tabEl) tabEl.classList.toggle('hidden', t !== tabId);
        const navBtn = document.getElementById(`nav-btn-${t}`);
        if (navBtn) {
            navBtn.classList.toggle('text-indigo-600', t === tabId);
            navBtn.classList.toggle('text-slate-400', t !== tabId);
        }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHeaderBadge(mode, tagId) {
    const badge = document.getElementById('header-badge');
    if (!badge) return;

    if (mode === 'finder') {
        badge.innerHTML = `<span class="bg-indigo-700 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full"><i class="fa-solid fa-eye mr-1"></i>Ficha: ${tagId}</span>`;
    } else if (mode === 'owner') {
        badge.innerHTML = `<span class="bg-amber-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full"><i class="fa-solid fa-shield-halved mr-1"></i>Modo Dueño</span>`;
    } else {
        badge.innerHTML = `<span class="bg-indigo-500/80 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">Portal</span>`;
    }
}

function copyText(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(() => {
        triggerToast("¡Enlace copiado al portapapeles!", "success");
    }).catch(() => {
        input.select();
        document.execCommand('copy');
        triggerToast("¡Copiado!", "success");
    });
}

function triggerToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');

    toast.className = `fixed top-4 right-4 z-50 max-w-sm w-full p-4 rounded-2xl shadow-2xl border flex items-start space-x-3 transition-all duration-300 transform translate-y-0 ${
        type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
    }`;

    icon.innerHTML = type === 'error' ? '<i class="fa-solid fa-triangle-exclamation text-rose-600 text-xl"></i>' : '<i class="fa-solid fa-circle-check text-emerald-600 text-xl"></i>';
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}
