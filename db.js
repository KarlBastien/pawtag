/**
 * PATATAG Production Database & Authentication Client
 * - Server API communication with robust error propagation
 * - Immediate synchronous session restore
 * - Zero hardcoded demo pets
 */

class PawTagDB {
    constructor() {
        this.apiBase = './api.php';
        this.currentUser = null;
        this.restoreLocalSession();
        this.verifyServerSession();
    }

    restoreLocalSession() {
        const savedUser = localStorage.getItem('patatag_current_user') || localStorage.getItem('pawtag_current_user');
        const token = localStorage.getItem('patatag_auth_token') || localStorage.getItem('pawtag_auth_token');
        if (savedUser && token) {
            try {
                this.currentUser = JSON.parse(savedUser);
                this.currentUser.token = token;
            } catch (e) {
                this.currentUser = null;
            }
        }
    }

    async verifyServerSession() {
        const token = localStorage.getItem('patatag_auth_token') || localStorage.getItem('pawtag_auth_token');
        if (!token) return;

        try {
            const res = await this.request('me');
            if (res && res.success && res.data) {
                this.currentUser = { ...res.data, token };
                localStorage.setItem('patatag_current_user', JSON.stringify(this.currentUser));
                if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
            } else {
                this.signOut();
            }
        } catch (e) {
            // Server offline or token expired
        }
    }

    async request(action, method = 'GET', body = null) {
        const token = localStorage.getItem('patatag_auth_token') || localStorage.getItem('pawtag_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Include token as query parameter as well for guaranteed Apache compatibility
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        const url = `${this.apiBase}?action=${action}${tokenParam}`;
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        try {
            const response = await fetch(url, options);
            const data = await response.json();
            return data;
        } catch (fetchErr) {
            console.warn("Fetch network error:", fetchErr);
            throw new Error("No se pudo conectar con el servidor. Comprobá tu conexión a internet.");
        }
    }

    // AUTHENTICATION: Sign Up
    async signUp(email, password, fullName) {
        const cleanEmail = email.trim().toLowerCase();
        const res = await this.request('register', 'POST', {
            email: cleanEmail,
            password,
            name: fullName.trim() || 'Dueño'
        });

        if (!res || !res.success) {
            throw new Error((res && res.error) ? res.error : 'Error al registrar la cuenta');
        }

        this.currentUser = res.data;
        localStorage.setItem('patatag_auth_token', res.data.token);
        localStorage.setItem('patatag_current_user', JSON.stringify(res.data));
        localStorage.removeItem('pawtag_auth_token');
        localStorage.removeItem('pawtag_current_user');
        if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
        return this.currentUser;
    }

    // AUTHENTICATION: Sign In
    async signIn(email, password) {
        const cleanEmail = email.trim().toLowerCase();
        const res = await this.request('login', 'POST', {
            email: cleanEmail,
            password
        });

        if (!res || !res.success) {
            throw new Error((res && res.error) ? res.error : 'Correo o contraseña incorrectos');
        }

        this.currentUser = res.data;
        localStorage.setItem('patatag_auth_token', res.data.token);
        localStorage.setItem('patatag_current_user', JSON.stringify(res.data));
        localStorage.removeItem('pawtag_auth_token');
        localStorage.removeItem('pawtag_current_user');
        if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
        return this.currentUser;
    }

    // AUTHENTICATION: Sign Out
    signOut() {
        this.currentUser = null;
        localStorage.removeItem('patatag_auth_token');
        localStorage.removeItem('patatag_current_user');
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
        } catch (e) {
            return null;
        }
    }

    // OWNER: Get all pets for current owner
    async getPetsByOwner() {
        if (!this.currentUser) return [];

        try {
            const res = await this.request('get_owner_pets');
            if (res && res.success && Array.isArray(res.data)) return res.data;
            return [];
        } catch (e) {
            return [];
        }
    }

    // OWNER: Save (Create or Update) Pet
    async savePet(petData) {
        if (!this.currentUser) throw new Error("Debés iniciar sesión para registrar una mascota.");

        const res = await this.request('save_pet', 'POST', { pet: petData });
        if (!res || !res.success) {
            throw new Error((res && res.error) ? res.error : 'Error al guardar mascota');
        }
        return res.data;
    }

    // OWNER: Delete Pet
    async deletePet(tagId) {
        if (!this.currentUser) throw new Error("Debés iniciar sesión para eliminar una mascota.");
        const normalized = tagId.trim().toUpperCase();

        const res = await this.request('delete_pet', 'POST', { tagId: normalized });
        if (!res || !res.success) {
            throw new Error((res && res.error) ? res.error : 'No se pudo eliminar la mascota');
        }
        return true;
    }

    // OWNER: Toggle Lost Mode
    async setLostMode(tagId, isLost) {
        if (!this.currentUser) throw new Error("No autenticado");
        const normalized = tagId.trim().toUpperCase();

        const res = await this.request('toggle_lost', 'POST', { tagId: normalized, isLost });
        return res && res.success;
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
            // Silently ignore ping failures
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
            return [];
        }
    }
}

// Global Database Instance
window.pawDB = new PawTagDB();
