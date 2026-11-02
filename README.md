# 🐾 PawTag - Smart NFC Pet Collar & Safety Tracker (PWA)

PawTag is a production-grade Progressive Web App (PWA) designed to turn any standard NFC medal or collar pendant into a smart pet identification and recovery system.

---

## ⚡ Quick Answers to Common Questions

### 1. Will NFC recognize my dog's chip?

* **Veterinary Subcutaneous Implant (Injected under the skin at the vet):**
  * **NO.** Implanted pet microchips operate on **134.2 kHz Low Frequency (LF)** RFID (ISO 11784/11785). Smartphones only contain **13.56 MHz High Frequency (HF)** NFC antennas. Only veterinarians and shelters with handheld scanners can read subcutaneous chips.
  * **Solution:** PawTag allows you to register the official 15-digit microchip number in the profile so that anyone who taps the collar or scans the QR code can immediately read and verify the microchip with a vet!
* **NFC Collar Tag / Medal / Smart Pendant (Attaches to the collar):**
  * **YES, 100%!** If your collar tag is an NFC chip (such as NTAG213, NTAG215, or NTAG216 operating at 13.56 MHz):
  * Any iPhone (iPhone XS or newer) and any modern Android phone can read it **natively without installing any app**.
  * Simply tapping the phone against the tag instantly opens the pet's emergency profile in the browser.

---

## ✨ Features

- **Dual-Mode Dynamic Routing:**
  - **Public Finder View:** The view shown to anyone who taps the collar or scans the QR code. Clean, mobile-friendly interface with large photo, owner phone call button (`tel:...`), direct WhatsApp button with pre-filled message, and GPS location sharing.
  - **Owner Admin Dashboard:** Protected management interface to edit pet data, upload photos from your phone/computer, toggle Lost Mode, test NFC, and generate collar QR codes.
- **🚨 Lost Mode:**
  - Instantly transforms the public page into a high-visibility flashing emergency warning with reward notes and urgent contact options.
- **📍 Real GPS Location Sharing:**
  - When someone finds your dog, they can tap *"Compartir mi Ubicación GPS"* to grab real-time device coordinates via the HTML5 Geolocation API and instantly send you a Google Maps link via WhatsApp or SMS.
- **📡 Real Web NFC Integration:**
  - Program your physical NFC tag directly from Google Chrome on Android using the native Web NFC API.
  - Scan physical tags to automatically extract their serial number (UID).
- **🔲 Dynamic QR Code Generator:**
  - Generates a sharp scannable QR code matching the NFC tag URL, with a 1-click printable emergency card for collar backup or wallet insertion.
- **📱 PWA (Progressive Web App):**
  - Offline-first caching via Service Worker (`sw.js`).
  - Native standalone experience on both iOS (Safari "Add to Home Screen") and Android (Chrome "Install App").
- **💾 Backup & Privacy:**
  - LocalStorage persistence.
  - 1-click JSON export and restore.
  - Optional Owner PIN protection.

---

## 🚀 How to Host on GitHub (Public vs. Private)

### Option A: Free Public GitHub Repository + GitHub Pages (Simplest)
GitHub Pages requires the repository to be **Public** on free accounts:

1. Create a new public repository on [GitHub](https://github.com/new) named `pawtag` (or any name).
2. Push your project:
   ```bash
   git init
   git add .
   git commit -m "Initial release of PawTag"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/pawtag.git
   git push -u origin main
   ```
3. In your GitHub repo, go to **Settings** > **Pages** > Select `Deploy from a branch` > branch `main` / `root` > **Save**.
4. Your app is live at: `https://<YOUR_USERNAME>.github.io/pawtag/`

---

### Option B: Private GitHub Repository + Free Cloudflare Pages / Vercel
If you want to keep your GitHub repository **Private**:

1. Create a **Private** repository on GitHub and push the code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of PawTag (Private)"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/pawtag.git
   git push -u origin main
   ```
2. Link the private repo to **Cloudflare Pages** (recommended, 100% free forever) or **Vercel**:
   - Go to [Cloudflare Pages](https://pages.cloudflare.com/) or [Vercel](https://vercel.com/).
   - Click **Add a Project** > Connect GitHub > Select your private `pawtag` repo.
   - Build Settings: Framework preset `None / Static HTML`, Build command `(leave empty)`, Output directory `(leave empty / root)`.
   - Click **Deploy**.
3. You get a fast, free HTTPS URL (e.g. `https://pawtag-xxx.pages.dev`) that anyone scanning the tag can access without login, while your GitHub repo stays completely private!

---

## 🏷️ How to Program Your NFC Collar Tag

1. Open your live PawTag website on your phone.
2. In PawTag, switch to the **NFC** tab and copy your **Public Finder URL** (e.g. `https://<your-domain>/#finder`).
3. **If using Android:**
   - Tap **"Programar Tag NFC Físico"** in the app.
   - Hold the collar tag against the back of your phone until it confirms with a green checkmark!
4. **If using iPhone:**
   - Download the free app **NFC Tools** from the App Store.
   - Open NFC Tools > **Write** > **Add a record** > **URL** > Paste your Public Finder URL.
   - Tap **Write / NDEF** and touch the collar tag to the top of your iPhone.
   - *(Note: This step only needs to be done once per physical tag).*

---

## 📲 How to Install as an App (PWA)

- **On iPhone (Safari):**
  Tap the **Share** button (box with arrow pointing up) > scroll down and tap **"Add to Home Screen"** > tap **Add**.
- **On Android (Chrome):**
  Tap the **3 dots menu** in the top right > tap **"Install App"** or **"Add to Home screen"**.
