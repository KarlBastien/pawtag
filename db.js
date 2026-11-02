/**
 * PawTag Database & Authentication Layer
 * Supports:
 * - Real-time Firebase Auth & Firestore (when configured)
 * - Intelligent local multi-tenant cloud simulation (for immediate zero-config testing)
 * - Multi-pet storage, Tag ID queries, and owner authorization
 */

// Firebase Configuration
// Replace with your Firebase project keys from https://console.firebase.google.com/
// If left as-is, PawTag seamlessly uses its local persistent multi-tenant engine!
const FIREBASE_CONFIG = {
    apiKey: "", // Optional: Your Firebase API Key
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

// Initial Sample Pets Database
const DEFAULT_SAMPLE_PETS = {
    "DEMO-MAX": {
        tagId: "DEMO-MAX",
        name: "Max",
        breed: "Golden Retriever",
        age: "3 años",
        gender: "Macho",
        photo: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&q=80&w=600",
        chipUid: "04:8A:3F:92:B1:80",
        vetMicrochip: "981098123456789", // Official 15-digit veterinary implant
        ownerId: "owner_karl",
        ownerName: "Carlos Bastien",
        phone: "+54 9 11 4567-8900",
        phone2: "+54 9 11 9876-5432",
        whatsapp: "5491145678900",
        city: "Palermo, Buenos Aires",
        vetClinic: "Veterinaria Central (Tel: +54 9 11 5555-4321)",
        medicalNotes: "Alérgico al pollo. Castrado y vacunación séxtuple y antirrábica al día.",
        reward: "Recompensa económica por devolución segura.",
        isLost: false,
        createdAt: new Date().toISOString()
    },
    "DEMO-LUNA": {
        tagId: "DEMO-LUNA",
        name: "Luna",
        breed: "Border Collie",
        age: "2 años",
        gender: "Hembra",
        photo: "https://images.unsplash.com/photo-1507146426996-ef05306b995a?auto=format&fit=crop&q=80&w=600",
        chipUid: "04:1B:7C:E3:44:90",
        vetMicrochip: "981098998877665",
        ownerId: "owner_karl",
        ownerName: "Carlos Bastien",
        phone: "+54 9 11 4567-8900",
        phone2: "",
        whatsapp: "5491145678900",
        city: "Recoleta, Buenos Aires",
        vetClinic: "Clínica Veterinaria Belgrano",
        medicalNotes: "Requiere gotas para los ojos. Muy dócil y asustadiza con ruidos fuertes.",
        reward: "",
        isLost: true, // Example of a lost pet for demonstration
        createdAt: new Date().toISOString()
    }
};

class PawTagDB {
    constructor() {
        this.isFirebaseReady = false;
        this.currentUser = null;
        this.init();
    }

    init() {
        // Try initializing Firebase if keys exist and SDK is loaded
        if (FIREBASE_CONFIG.apiKey && window.firebase && !window.firebase.apps.length) {
            try {
                window.firebase.initializeApp(FIREBASE_CONFIG);
                this.auth = window.firebase.auth();
                this.firestore = window.firebase.firestore();
                this.isFirebaseReady = true;
                console.log("PawTag: Firebase conectado correctamente.");

                // Listen for real auth state
                this.auth.onAuthStateChanged(user => {
                    this.currentUser = user ? { id: user.uid, email: user.email } : null;
                    if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
                });
                return;
            } catch (err) {
                console.warn("PawTag: Error al conectar Firebase, usando modo local:", err);
            }
        }

        // Local Storage Multi-Tenant Engine
        this.initLocalStorageEngine();
    }

    initLocalStorageEngine() {
        // Seed default pets if empty
        const savedPets = localStorage.getItem('pawtag_cloud_pets');
        if (!savedPets) {
            localStorage.setItem('pawtag_cloud_pets', JSON.stringify(DEFAULT_SAMPLE_PETS));
        }

        // Restore active user session if exists
        const savedUser = localStorage.getItem('pawtag_current_user');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
            } catch (e) {
                this.currentUser = null;
            }
        }
    }

    // Get All Pets Stored Locally
    _getLocalPets() {
        try {
            const data = localStorage.getItem('pawtag_cloud_pets');
            return data ? JSON.parse(data) : { ...DEFAULT_SAMPLE_PETS };
        } catch (e) {
            return { ...DEFAULT_SAMPLE_PETS };
        }
    }

    // Save All Pets Locally
    _setLocalPets(pets) {
        localStorage.setItem('pawtag_cloud_pets', JSON.stringify(pets));
    }

    // AUTHENTICATION: Sign Up
    async signUp(email, password, fullName) {
        if (this.isFirebaseReady) {
            const userCred = await this.auth.createUserWithEmailAndPassword(email, password);
            await userCred.user.updateProfile({ displayName: fullName });
            this.currentUser = { id: userCred.user.uid, email: userCred.user.email, name: fullName };
            return this.currentUser;
        }

        // Local mock sign up
        const users = JSON.parse(localStorage.getItem('pawtag_mock_users') || '{}');
        const cleanEmail = email.toLowerCase().trim();
        if (users[cleanEmail]) {
            throw new Error("Ya existe una cuenta con este correo electrónico.");
        }

        const userId = 'usr_' + Math.random().toString(36).substring(2, 10);
        users[cleanEmail] = { id: userId, email: cleanEmail, password, name: fullName || "Dueño" };
        localStorage.setItem('pawtag_mock_users', JSON.stringify(users));

        this.currentUser = { id: userId, email: cleanEmail, name: fullName || "Dueño" };
        localStorage.setItem('pawtag_current_user', JSON.stringify(this.currentUser));
        if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
        return this.currentUser;
    }

    // AUTHENTICATION: Login
    async signIn(email, password) {
        if (this.isFirebaseReady) {
            const userCred = await this.auth.signInWithEmailAndPassword(email, password);
            this.currentUser = { id: userCred.user.uid, email: userCred.user.email, name: userCred.user.displayName };
            return this.currentUser;
        }

        // Local mock sign in
        const cleanEmail = email.toLowerCase().trim();
        const users = JSON.parse(localStorage.getItem('pawtag_mock_users') || '{}');

        // Allow instant login for demo owner
        if (cleanEmail === 'owner@pawtag.ar' || cleanEmail === 'karl@pawtag.ar' || cleanEmail === 'demo@pawtag.ar') {
            this.currentUser = { id: 'owner_karl', email: cleanEmail, name: 'Carlos Bastien' };
            localStorage.setItem('pawtag_current_user', JSON.stringify(this.currentUser));
            if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
            return this.currentUser;
        }

        const found = users[cleanEmail];
        if (!found || found.password !== password) {
            throw new Error("Correo o contraseña incorrectos.");
        }

        this.currentUser = { id: found.id, email: found.email, name: found.name };
        localStorage.setItem('pawtag_current_user', JSON.stringify(this.currentUser));
        if (window.onAuthChanged) window.onAuthChanged(this.currentUser);
        return this.currentUser;
    }

    // AUTHENTICATION: Sign Out
    async signOut() {
        if (this.isFirebaseReady) {
            await this.auth.signOut();
        }
        this.currentUser = null;
        localStorage.removeItem('pawtag_current_user');
        if (window.onAuthChanged) window.onAuthChanged(null);
    }

    // PET LOOKUP: Fetch single pet by Tag ID (Used by anyone who scans the collar tag)
    async getPetByTag(tagId) {
        if (!tagId) return null;
        const normalizedTag = tagId.trim().toUpperCase();

        if (this.isFirebaseReady) {
            const doc = await this.firestore.collection('pets').doc(normalizedTag).get();
            if (doc.exists) {
                return { tagId: doc.id, ...doc.data() };
            }
            return null;
        }

        // Local lookup
        const pets = this._getLocalPets();
        return pets[normalizedTag] || null;
    }

    // OWNER CRUD: Get all pets belonging to current owner
    async getPetsByOwner(ownerId) {
        const targetOwnerId = ownerId || (this.currentUser ? this.currentUser.id : null);
        if (!targetOwnerId) return [];

        if (this.isFirebaseReady) {
            const snapshot = await this.firestore.collection('pets')
                .where('ownerId', '==', targetOwnerId)
                .get();
            const list = [];
            snapshot.forEach(doc => list.push({ tagId: doc.id, ...doc.data() }));
            return list;
        }

        // Local lookup
        const pets = this._getLocalPets();
        return Object.values(pets).filter(p => p.ownerId === targetOwnerId || p.ownerId === 'owner_karl');
    }

    // OWNER CRUD: Save (Create or Update) Pet
    async savePet(petData) {
        if (!this.currentUser) {
            throw new Error("Debés iniciar sesión como dueño para guardar una mascota.");
        }

        const tagId = (petData.tagId || 'PAW-' + Math.random().toString(36).substring(2, 8)).trim().toUpperCase();
        const record = {
            ...petData,
            tagId,
            ownerId: this.currentUser.id,
            ownerEmail: this.currentUser.email,
            updatedAt: new Date().toISOString()
        };

        if (this.isFirebaseReady) {
            await this.firestore.collection('pets').doc(tagId).set(record, { merge: true });
            return record;
        }

        // Local save
        const pets = this._getLocalPets();
        pets[tagId] = record;
        this._setLocalPets(pets);
        return record;
    }

    // OWNER CRUD: Delete Pet
    async deletePet(tagId) {
        if (!this.currentUser) {
            throw new Error("Debés iniciar sesión como dueño.");
        }

        const normalizedTag = tagId.trim().toUpperCase();
        if (this.isFirebaseReady) {
            await this.firestore.collection('pets').doc(normalizedTag).delete();
            return true;
        }

        const pets = this._getLocalPets();
        if (pets[normalizedTag]) {
            delete pets[normalizedTag];
            this._setLocalPets(pets);
            return true;
        }
        return false;
    }

    // TOGGLE LOST MODE: Update isLost in real time
    async setLostMode(tagId, isLost) {
        const normalizedTag = tagId.trim().toUpperCase();
        if (this.isFirebaseReady) {
            await this.firestore.collection('pets').doc(normalizedTag).update({
                isLost: Boolean(isLost),
                updatedAt: new Date().toISOString()
            });
            return true;
        }

        const pets = this._getLocalPets();
        if (pets[normalizedTag]) {
            pets[normalizedTag].isLost = Boolean(isLost);
            pets[normalizedTag].updatedAt = new Date().toISOString();
            this._setLocalPets(pets);
            return true;
        }
        return false;
    }

    // LOG SCAN / GPS PING
    async logScanEvent(tagId, logData) {
        const normalizedTag = tagId ? tagId.trim().toUpperCase() : 'GENERAL';
        const logEntry = {
            ...logData,
            tagId: normalizedTag,
            timestamp: new Date().toISOString()
        };

        const logs = JSON.parse(localStorage.getItem('pawtag_scan_logs') || '[]');
        logs.unshift(logEntry);
        localStorage.setItem('pawtag_scan_logs', JSON.stringify(logs.slice(0, 50)));

        if (this.isFirebaseReady) {
            try {
                await this.firestore.collection('scans').add(logEntry);
            } catch (e) {
                console.error("Error al registrar escaneo en Firestore:", e);
            }
        }
        return logEntry;
    }

    getScanLogs(tagId) {
        const logs = JSON.parse(localStorage.getItem('pawtag_scan_logs') || '[]');
        if (tagId) {
            const normalized = tagId.trim().toUpperCase();
            return logs.filter(l => l.tagId === normalized);
        }
        return logs;
    }
}

// Global Database Instance
window.pawDB = new PawTagDB();
