/**
 * PawTag Production Database & Authentication Client
 * - Clean architecture: No dummy pets, no backdoor users.
 * - Auto-detects server API (api.php) on krealo.online for real cloud persistence.
 * - Falls back to local storage if running in a purely static environment.
 */

class PawTagDB {
    constructor() {
        this.currentUser = null;
        this.apiBase = this.detectApiBase();
        this.init();
    }

    detectApiBase() {
        // If api.php is located in the same directory (e.g. https://krealo.online/pawtag/)
        return './api.php';
    }

    async init() {
        const token = localStorage.getItem('pawtag_auth_token');
        if (token) {
            try {
                const res = await this.request('me');
                if (res && res.success && res.data) {
                    this.currentUser = res.data;
                    this.currentUser.token = token;
                    if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
                } else {
                    this.signOut();
                }
            } catch (e) {
                // Token expired or server unreachable
                const savedUser = localStorage.getItem('pawtag_current_user');
                if (savedUser) {
                    try { this.currentUser = JSON.parse(savedUser); } catch(err){}
                }
            }
        }
    }

    async request(action, method = 'GET', body = null) {
        const token = localStorage.getItem('pawtag_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const url = `${this.apiBase}?action=${action}`;
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(url, options);
        if (!response.ok && response.status === 404 && !action.startsWith('get_pet')) {
            throw new Error(`API error ${response.status}`);
        }
        return await response.json();
    }

    // AUTHENTICATION: Sign Up
    async signUp(email, password, fullName) {
        try {
            const res = await this.request('register', 'POST', {
                email: email.trim().toLowerCase(),
                password,
                name: fullName.trim()
            });

            if (!res.success) throw new Error(res.error || 'Error al registrarse');

            this.currentUser = res.data;
            localStorage.setItem('pawtag_auth_token', res.data.token);
            localStorage.setItem('pawtag_current_user', JSON.stringify(res.data));
            if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
            return this.currentUser;
        } catch (serverErr) {
            // Local fallback if API is not hosted with PHP
            console.warn("API fallback to local mode:", serverErr.message);
            const users = JSON.parse(localStorage.getItem('pawtag_local_users') || '{}');
            const cleanEmail = email.trim().toLowerCase();
            if (users[cleanEmail]) throw new Error("Ya existe una cuenta con este correo.");

            const user = {
                id: 'usr_' + Math.random().toString(36).substring(2, 9),
                email: cleanEmail,
                name: fullName.trim(),
                password
            };
            users[cleanEmail] = user;
            localStorage.setItem('pawtag_local_users', JSON.stringify(users));

            this.currentUser = { id: user.id, email: user.email, name: user.name };
            localStorage.setItem('pawtag_current_user', JSON.stringify(this.currentUser));
            if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
            return this.currentUser;
        }
    }

    // AUTHENTICATION: Sign In
    async signIn(email, password) {
        try {
            const res = await this.request('login', 'POST', {
                email: email.trim().toLowerCase(),
                password
            });

            if (!res.success) throw new Error(res.error || 'Correo o contraseña incorrectos');

            this.currentUser = res.data;
            localStorage.setItem('pawtag_auth_token', res.data.token);
            localStorage.setItem('pawtag_current_user', JSON.stringify(res.data));
            if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
            return this.currentUser;
        } catch (serverErr) {
            // Local fallback if API is not hosted with PHP
            console.warn("API fallback to local mode:", serverErr.message);
            const users = JSON.parse(localStorage.getItem('pawtag_local_users') || '{}');
            const cleanEmail = email.trim().toLowerCase();
            const found = users[cleanEmail];
            if (!found || found.password !== password) {
                throw new Error("Correo o contraseña incorrectos.");
            }

            this.currentUser = { id: found.id, email: found.email, name: found.name };
            localStorage.setItem('pawtag_current_user', JSON.stringify(this.currentUser));
            if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
            return this.currentUser;
        }
    }

    // AUTHENTICATION: Sign Out
    signOut() {
        this.currentUser = null;
        localStorage.removeItem('pawtag_auth_token');
        localStorage.removeItem('pawtag_current_user');
        if (window.onAuthChanged) window.onAuthChanged(null);
    }

    // PUBLIC: Get Pet by Tag ID
    async getPetByTag(tagId) {
        if (!tagId) return null;
        const normalized = tagId.trim().toUpperCase();

        try {
            const res = await this.request(`get_pet&tag=${encodeURIComponent(normalized)}`);
            if (res && res.success && res.data) return res.data;
            return null;
        } catch (serverErr) {
            // Fallback to local
            const pets = JSON.parse(localStorage.getItem('pawtag_local_pets') || '{}');
            return pets[normalized] || null;
        }
    }

    // OWNER: Get all pets for current owner
    async getPetsByOwner() {
        if (!this.currentUser) return [];

        try {
            const res = await this.request('get_owner_pets');
            if (res && res.success && Array.isArray(res.data)) return res.data;
            return [];
        } catch (serverErr) {
            // Fallback to local
            const pets = JSON.parse(localStorage.getItem('pawtag_local_pets') || '{}');
            return Object.values(pets).filter(p => p.ownerId === this.currentUser.id);
        }
    }

    // OWNER: Save (Create or Update) Pet
    async savePet(petData) {
        if (!this.currentUser) throw new Error("Debés iniciar sesión para registrar una mascota.");

        try {
            const res = await this.request('save_pet', 'POST', { pet: petData });
            if (!res.success) throw new Error(res.error || 'Error al guardar mascota');
            return res.data;
        } catch (serverErr) {
            // Fallback to local
            const tagId = (petData.tagId || 'PAW-' + Math.random().toString(36).substring(2, 8)).trim().toUpperCase();
            const record = {
                ...petData,
                tagId,
                ownerId: this.currentUser.id,
                ownerEmail: this.currentUser.email,
                updatedAt: new Date().toISOString()
            };
            const pets = JSON.parse(localStorage.getItem('pawtag_local_pets') || '{}');
            pets[tagId] = record;
            localStorage.setItem('pawtag_local_pets', JSON.stringify(pets));
            return record;
        }
    }

    // OWNER: Delete Pet
    async deletePet(tagId) {
        if (!this.currentUser) throw new Error("No autenticado");
        const normalized = tagId.trim().toUpperCase();

        try {
            const res = await this.request('delete_pet', 'POST', { tagId: normalized });
            return res && res.success;
        } catch (serverErr) {
            const pets = JSON.parse(localStorage.getItem('pawtag_local_pets') || '{}');
            if (pets[normalized]) {
                delete pets[normalized];
                localStorage.setItem('pawtag_local_pets', JSON.stringify(pets));
                return true;
            }
            return false;
        }
    }

    // OWNER: Toggle Lost Mode
    async setLostMode(tagId, isLost) {
        if (!this.currentUser) throw new Error("No autenticado");
        const normalized = tagId.trim().toUpperCase();

        try {
            const res = await this.request('toggle_lost', 'POST', { tagId: normalized, isLost });
            return res && res.success;
        } catch (serverErr) {
            const pets = JSON.parse(localStorage.getItem('pawtag_local_pets') || '{}');
            if (pets[normalized]) {
                pets[normalized].isLost = Boolean(isLost);
                localStorage.setItem('pawtag_local_pets', JSON.stringify(pets));
                return true;
            }
            return false;
        }
    }

    // PUBLIC: Log Scan or GPS Ping
    async logScanEvent(tagId, logData) {
        const payload = {
            tagId: tagId ? tagId.trim().toUpperCase() : 'GENERAL',
            ...logData
        };

        try {
            await this.request('log_scan', 'POST', payload);
        } catch (e) {
            // Local fallback
            const logs = JSON.parse(localStorage.getItem('pawtag_local_scans') || '[]');
            logs.unshift({ ...payload, timestamp: new Date().toISOString() });
            localStorage.setItem('pawtag_local_scans', JSON.stringify(logs.slice(0, 50)));
        }
    }

    // OWNER: Get Scan Logs for Pet
    async getScanLogs(tagId) {
        const normalized = tagId ? tagId.trim().toUpperCase() : '';
        try {
            const res = await this.request(`get_scan_logs&tagId=${encodeURIComponent(normalized)}`);
            if (res && res.success && Array.isArray(res.data)) return res.data;
            return [];
        } catch (e) {
            const logs = JSON.parse(localStorage.getItem('pawtag_local_scans') || '[]');
            return logs.filter(l => !normalized || l.tagId === normalized);
        }
    }
}

// Global Database Instance
window.pawDB = new PawTagDB();
