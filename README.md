# Maafushivaru Inventory — Mobile (Android)

A lightweight **read-only companion app** for the
[Maafushivaru Inventory](https://github.com/roni2026/maafushivaru-inventory) web system.
It connects to the **same Supabase backend** as the website and lets store staff quickly
check things on their phone — without the full desktop workflow.

Built with **Expo (React Native)**, so it produces a real installable **Android APK**.

---

## ✨ Features (intentionally limited)

| Feature | What it does |
|---|---|
| 🔍 **Inventory search** | Search items by **name**, **ID (part number)** or **description / notes**. Filter by main category (General / Food / Beverage). Tap an item for full details (stock, min, expiry, supplier, store). |
| 📄 **Pending requisitions** | Lists requisitions with a **Pending** filter (lines ordered but not yet issued). Tap one to see every line, its issued/ordered qty and status. |
| 🚤 **This week's boat note** | Shows boat note(s) for the **current week** and lets you **sort** the lines by name, ordered qty, received qty, department or supplier (ascending/descending). Switch to **Latest** to browse earlier notes. |
| 🔔 **Alerts** | Low-stock / out-of-stock list and an expiring-soon (≤ 30 days) list. |
| 🏠 **Home dashboard** | At-a-glance counts (active items, low/out, expiring, pending reqs, boat notes this week) with quick navigation. |
| ⚙️ **Settings** | Point the app at any Supabase project (URL + anon key) right inside the app — no rebuild needed. |

> The app is **read-only** and uses only the Supabase **anon (public) key**. It never writes,
> deletes or mutates data.

---

## 🧱 Tech stack

- **Expo SDK 51** + React Native 0.74
- **React Navigation** (bottom tabs + native stack)
- **@supabase/supabase-js** v2
- **AsyncStorage** for on-device config

---

## ✅ Prerequisites

1. **Node.js 18+** and npm — <https://nodejs.org>
2. A **free Expo account** — <https://expo.dev/signup>
3. **EAS CLI** (for building the APK):
   ```bash
   npm install -g eas-cli
   ```
4. Your Supabase project **URL** and **anon public key**
   (Supabase dashboard → *Project Settings* → *API*). This is the **same** project the website uses.
5. (Optional, for testing without building) the **Expo Go** app from the Play Store.

---

## 🚀 Quick start (run in development)

```bash
# 1. Clone
git clone https://github.com/roni2026/maafushivaru-inventory-mobile.git
cd maafushivaru-inventory-mobile

# 2. Install dependencies
npm install

# 3. Start the dev server
npx expo start
```

Then either:
- Press **a** to open an Android emulator, **or**
- Scan the QR code with the **Expo Go** app on your phone.

On first launch the app shows a **Setup** screen — paste your **Supabase URL** and **anon key** and
tap **Connect**. (You can change these later in **Settings**.)

---

## 🔧 Configure the backend (two ways)

**Option A — in-app (easiest).** Just enter the URL + anon key on the Setup/Settings screen.
They are stored on the device with AsyncStorage. Great for handing the APK to staff and letting
them paste credentials once.

**Option B — baked in at build time.** Edit `app.json` → `expo.extra` so every install is
pre-configured:

```jsonc
"extra": {
  "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
  "SUPABASE_ANON_KEY": "eyJhbGciOi...your-anon-key...",
  "eas": { "projectId": "" }
}
```

In-app values (Option A) always override the build-time defaults.

---

## 📦 Build the Android APK (EAS Build — recommended)

This builds in the cloud (no Android Studio needed) and gives you a downloadable `.apk`.

```bash
# 1. Log in to Expo
eas login

# 2. Link the project (creates an EAS project + fills in projectId)
eas init

# 3. Build the APK using the "preview" profile (already set to apk in eas.json)
eas build -p android --profile preview
```

When the build finishes, the CLI prints a **download URL**. Open it and download the `.apk`,
or find it under your project on <https://expo.dev>. Transfer it to an Android device and install
(allow *Install unknown apps* for your file manager/browser).

> The `preview` profile in `eas.json` is configured with `"buildType": "apk"` so you get an APK
> rather than an AAB. The `production` profile builds an **app bundle (.aab)** for the Play Store.

### Custom app icon (optional)

The app ships with Expo's default icon so it builds with **zero binary assets**. To brand it,
drop a 1024×1024 `icon.png` into an `assets/` folder and add this to `app.json` → `expo`:

```jsonc
"icon": "./assets/icon.png",
"android": { "adaptiveIcon": { "foregroundImage": "./assets/icon.png", "backgroundColor": "#0d9488" } }
```

### Build the APK locally (alternative)

If you prefer to build on your own machine you need the Android SDK + JDK 17 installed, then:

```bash
eas build -p android --profile preview --local
```

Or generate a native project and build with Gradle:

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK -> android/app/build/outputs/apk/release/app-release.apk
```

---

## 🔐 Supabase access (important)

The app reads these tables with the **anon key**:

- `items` (+ joined `stores`)
- `requisitions`, `requisition_items`
- `boat_notes`, `boat_note_items`

Your Supabase project must allow **SELECT** for the `anon` role on these tables (via Row Level
Security policies). The web app already reads them with the anon key, so if the website works,
the mobile app will too. If you see *“permission denied”*, add read policies, e.g.:

```sql
alter table items enable row level security;
create policy "anon read items" on items for select to anon using (true);
-- repeat for requisitions, requisition_items, boat_notes, boat_note_items
```

> Only expose what you're comfortable making readable with the public anon key.

---

## 🗂 Project structure

```
mvm-inventory-mobile/
├── App.js                     # Navigation (tabs + stack) + theme
├── index.js                   # Entry point (url polyfill + root register)
├── app.json                   # Expo config (android package, icons, extra)
├── eas.json                   # EAS build profiles (preview = apk)
└── src/
    ├── context/AppContext.js  # Loads config, builds Supabase client
    ├── lib/
    │   ├── config.js          # Read/save Supabase creds (AsyncStorage + app.json)
    │   ├── supabase.js        # Client factory + paginated fetchAll
    │   ├── format.js          # date / week / number helpers
    │   └── theme.js           # colors / spacing
    ├── components/ui.js       # Reusable UI (Card, Badge, SearchBar, Chip…)
    └── screens/
        ├── HomeScreen.js
        ├── InventoryScreen.js
        ├── ItemDetailScreen.js
        ├── RequisitionsScreen.js
        ├── RequisitionDetailScreen.js
        ├── BoatNoteScreen.js
        ├── AlertsScreen.js
        ├── SettingsScreen.js
        └── SetupScreen.js
```

---

## 🩹 Troubleshooting

| Problem | Fix |
|---|---|
| Stuck on Setup / "Could not connect" | Double-check the URL (`https://...supabase.co`) and the **anon** key (not the service key). Test on **Settings → Test connection**. |
| Empty lists everywhere | Verify RLS allows `anon` SELECT (see above) and that the project actually has data. |
| `eas build` asks for a project ID | Run `eas init` first, or let it create one when prompted. |
| APK won't install on phone | Enable *Install unknown apps* for your browser/file manager. |
| Expo Go shows a blank screen | Make sure you ran `npm install` and are on Node 18+. |

---

## 📄 License

MIT — see [LICENSE](LICENSE). Companion app to the Outrigger Maafushivaru Resort inventory system.
