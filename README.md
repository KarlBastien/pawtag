# 🐾 PawTag - Multi-Pet NFC Collar & Safety Platform (PWA)

PawTag is a production-grade Progressive Web App (PWA) designed to manage smart NFC collar tags for hundreds of pets. Each pet has its own scannable tag identifier (`?tag=TAG_ID`), allowing any finder to view that pet's emergency profile while keeping the owner's management dashboard securely authenticated.

---

## ⚡ Answers to Common Questions

### 1. Why am I seeing a default dog?
The previous version used single-browser `localStorage`. The new version is a **Multi-Pet Cloud Platform**:
- Each pet is saved with a unique tag ID (e.g. `?tag=DEMO-MAX` or `?tag=PAW-8A3F92`).
- When someone scans a physical collar, their phone queries that specific tag and loads **only that dog's live information**.
- If opening the main root website without any tag, it displays the PawTag search portal instead of a hardcoded dog.

### 2. Can strangers access the Admin Dashboard?
**No.** The Finder View contains **zero admin controls** and no editing capabilities. Only logged-in owners (via Email/Password or demo authentication) can access the management dashboard to create, edit, or delete their pets.

### 3. Why is the NFC scanner not detecting my chip?
There are three main hardware reasons:
1. **Subcutaneous Vet Microchip (injected under skin):**
   - **Phones CANNOT read this.** Veterinary chips operate on **134.2 kHz Low Frequency (LF) RFID**. Smartphones only have **13.56 MHz High Frequency (HF) NFC** antennas. No app or website can change this frequency gap. PawTag displays the official 15-digit microchip number on screen so any vet can check it with their clinic scanner.
2. **iPhone / iOS Apple Restriction:**
   - Apple **blocks Web NFC inside mobile browsers** (Safari and Chrome on iOS).
   - iPhones read NFC from the lock/home screen automatically, but **only if the tag already has an NDEF URL written to it**. If your tag is fresh from the factory, download the free **NFC Tools** app from the App Store, write your pet's URL (`https://.../?tag=...`) once, and it will work forever on any phone!
3. **Android Phones:**
   - Make sure NFC is toggled ON under `Settings > Connected devices > NFC`.
   - The NFC antenna is usually near the camera module.

---

## ✨ Features

- **Multi-Pet Dynamic Routing (`?tag=TAG_ID`):**
  - Instant lookup of any pet from the database.
  - Scannable via NFC or QR code.
- **🚨 Lost Mode Toggle:**
  - Instantly transforms that specific dog's public page into a flashing red emergency warning with reward information and urgent contact buttons.
- **📍 Real GPS Location Sharing:**
  - Finders can tap *"Compartir mi Ubicación GPS"* to pull exact device coordinates via the HTML5 Geolocation API and dispatch a Google Maps link to the owner via WhatsApp or SMS.
- **🔒 Authenticated Owner Dashboard:**
  - Register and manage multiple pets (Max, Luna, etc.) under one account.
  - Upload photos directly from phone/laptop or URL.
  - Real-time cloud synchronization (Firestore ready + zero-config local engine).
- **📡 Web NFC & Dynamic QR Generator:**
  - Program your physical collar tag directly from Chrome Android.
  - Dynamic QR codes generated for each pet with 1-click printable emergency collar cards.
- **📱 PWA (Progressive Web App):**
  - Offline-ready via Service Worker (`sw.js`).
  - Standalone app experience on iOS (Safari "Add to Home Screen") and Android (Chrome "Install App").

---

## 🚀 Live Production Deployment

- 🌐 **Primary Live URL:** [https://patatag.krealo.online/](https://patatag.krealo.online/)
- 🌐 **Alternative Alias:** [https://pawtag.krealo.online/](https://pawtag.krealo.online/)
- 🔗 **GitHub Repository:** [https://github.com/KarlBastien/pawtag](https://github.com/KarlBastien/pawtag)

### Quick Test Links:
- **Kiwi's Live Emergency Profile:** [https://patatag.krealo.online/?tag=PAW-NSH8MZ](https://patatag.krealo.online/?tag=PAW-NSH8MZ)
- **Owner Dashboard & Portal:** [https://patatag.krealo.online/](https://patatag.krealo.online/)
