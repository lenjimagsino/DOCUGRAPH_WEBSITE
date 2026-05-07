# DOCUGRAPH Website

Graph-Based Document Layout Analysis — research website with full Firebase Authentication.

## Pages

**Public**
- `index.html` — Landing page (Hero, Features, How It Works, About, Team, Contact)
- `login.html` — Sign in (Google, Microsoft, Email/Password)
- `signup.html` — Create account (Google, Microsoft, Email/Password)
- `reset-password.html` — Forgot password / send reset email
- `verify-email.html` — Email verification holding screen

**Protected (require authentication)**
- `dashboard.html` — User dashboard (greeting, stats, recent docs, quick actions)
- `try.html` — Document upload page
- `processing.html` — Animated processing pipeline
- `results.html` — Structured OCR output

## Authentication Flow

```
Landing Page (index.html)
     ↓
Login / Create Account
     ↓
Firebase Authentication
   ├─ Email/Password (with verification email)
   ├─ Google Sign-In (popup)
   └─ Microsoft Sign-In (popup)
     ↓
Dashboard (dashboard.html)
     ↓
Document Processing (try → processing → results)
```

## 🔥 Firebase Setup (REQUIRED before auth works)

### 1. Create a Firebase project
1. Go to https://console.firebase.google.com/
2. Click **Add project**, name it (e.g. `docugraph`), continue through setup
3. (Optional) Disable Google Analytics for a faster setup

### 2. Register a Web App
1. In the project overview, click the **`</>`** (Web) icon to add an app
2. Nickname it `docugraph-web`, **don't** enable hosting yet
3. Copy the `firebaseConfig` object Firebase shows you

### 3. Paste credentials into `assets/firebase-config.js`
Replace the placeholder values with your real ones:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...your-key",
  authDomain:        "docugraph.firebaseapp.com",
  projectId:         "docugraph",
  storageBucket:     "docugraph.appspot.com",
  messagingSenderId: "1234567890",
  appId:             "1:1234567890:web:abc123"
};
```

### 4. Enable sign-in providers
In Firebase Console → **Authentication** → **Sign-in method**, enable:

**a) Email/Password** — Click → toggle **Enable** → Save

**b) Google** — Click → toggle **Enable** → choose support email → Save

**c) Microsoft** — Click → toggle **Enable**
- Register an Azure AD app at https://portal.azure.com/ → App registrations → New registration
  - Name: `DOCUGRAPH`
  - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
  - Redirect URI (Web): `https://YOUR_PROJECT.firebaseapp.com/__/auth/handler`
- Copy the **Application (client) ID** → paste in Firebase
- Generate a **Client secret** (Certificates & secrets → New client secret) → paste in Firebase
- Save

### 5. Add your domain to authorized domains
Authentication → **Settings** → **Authorized domains** → Add:
- `localhost` (already there by default)
- Your production domain (e.g. `docugraph.vercel.app`)

That's it — auth works now.

## Running locally (VS Code)

1. Open the folder in VS Code
2. Install the **Live Server** extension (Ritwick Dey)
3. Right-click `index.html` → **Open with Live Server**

> ⚠️ **Don't open via `file://`** — Firebase popups need an `http://` or `https://` origin, so you must use Live Server (or `python3 -m http.server`).

```bash
# Or use Python
python3 -m http.server 8000
# Visit http://localhost:8000
```

## Deploying

### Vercel (recommended)
1. Push this folder to GitHub
2. Import on https://vercel.com → Framework: **Other** → Build: empty → Output: `./`
3. Add your Vercel domain to Firebase **Authorized domains**

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # public dir: . (this folder), single-page: No
firebase deploy
```

## File structure

```
docugraph/
├── index.html              ← Landing (public)
├── login.html              ← Sign in
├── signup.html             ← Create account
├── reset-password.html     ← Forgot password
├── verify-email.html       ← Email verification
├── dashboard.html          ← Protected — main user area
├── try.html                ← Protected — upload
├── processing.html         ← Protected — analysis
├── results.html            ← Protected — output
├── README.md
└── assets/
    ├── logo.png
    ├── style.css
    ├── main.js             ← Site-wide UI (navbar, scroll, etc.)
    ├── firebase-config.js  ← ⚠️ ADD YOUR FIREBASE KEYS HERE
    └── auth.js             ← Auth helpers (sign-in, sign-up, reset, verify, logout)
```

## Auth API reference (`assets/auth.js`)

```js
import {
  signUpWithEmail, signInWithEmail,
  signInWithGoogle, signInWithMicrosoft,
  sendResetEmail, resendVerificationEmail,
  logout, requireAuth,
  onAuthStateChanged, auth, authErrorMessage
} from "./assets/auth.js";

// Examples
await signUpWithEmail("Jane Reyes", "jane@x.com", "Pass1234!");
await signInWithGoogle();
await sendResetEmail("jane@x.com");
await logout();
```

## Customization

All colors live in CSS variables at the top of `assets/style.css`:
- `--green-700` primary brand
- `--green-500` accent
- `--green-100` soft background
- `--ink-900` body text