/**
 * Admin Security Guard
 * Protects all admin routes. Runs on every admin/* page BEFORE the dashboard loads.
 *
 * FIX SUMMARY (v3):
 *  1. Uses getApps()/getApp() to avoid "duplicate-app" crash when admin.js
 *     also calls initializeApp on the same page.
 *  2. Unsubscribes from onAuthStateChanged after the FIRST callback — prevents
 *     token-refresh re-fires from triggering a second redirect or re-check.
 *  3. Redirects unauthenticated users to the dedicated admin login page,
 *     NOT the store homepage.
 *  4. 8-second safety timeout shows a human-readable error instead of
 *     leaving the user stuck on the spinner forever.
 *  5. Firestore errors show a message and allow the user to retry via refresh
 *     (no silent redirect on network failure).
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB51QUy-6JfhsIBAIET2wQxTc9Yp1RXekY",
    authDomain: "portfolio-8f1ca.firebaseapp.com",
    projectId: "portfolio-8f1ca",
    storageBucket: "portfolio-8f1ca.firebasestorage.app",
    messagingSenderId: "261283936769",
    appId: "1:261283936769:web:ce65b52a9dbc1df0f6de00"
};

// Reuse existing Firebase instance — prevents "duplicate-app" crash
// when admin.js (loaded after this script) also calls initializeApp.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─── UI refs ──────────────────────────────────────────────────────────────────
const loader    = document.getElementById('admin-loader');
const loaderMsg = loader?.querySelector('p');

function showLoaderError(msg) {
    if (loaderMsg) loaderMsg.textContent = msg;
    // Stop the spinner visually
    const spinner = loader?.querySelector('.loader-spinner');
    if (spinner) spinner.style.animationPlayState = 'paused';
}

function hideLoader() {
    document.body.classList.remove('admin-loading');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => { loader.style.display = 'none'; }, 400);
    }
}

// ─── Safety timeout ───────────────────────────────────────────────────────────
// If Firebase CDN is blocked or the network is too slow, stop spinning after 8s.
const safetyTimeout = setTimeout(() => {
    if (loader && !loader.classList.contains('hidden')) {
        showLoaderError('Verification timed out. Please refresh the page.');
        console.error('Admin guard: onAuthStateChanged never resolved within 8 s');
    }
}, 8000);

// ─── Auth check ───────────────────────────────────────────────────────────────
// KEY FIX: capture the unsubscribe function and call it after the first
// meaningful callback.  This prevents token-refresh re-fires (which emit
// a new User object) from running the Firestore check a second time.
const unsubscribe = onAuthStateChanged(auth, async (user) => {

    // ── NO USER ──────────────────────────────────────────────────────────────
    if (!user) {
        // onAuthStateChanged fires exactly once during page init with either
        // the persisted user or null.  A null here is definitive: not logged in.
        unsubscribe(); // stop listening
        clearTimeout(safetyTimeout);
        sessionStorage.removeItem('admin_verified');
        // Redirect to the dedicated admin login page (not the store homepage)
        window.location.replace('./login.html');
        return;
    }

    // ── USER EXISTS ───────────────────────────────────────────────────────────
    unsubscribe(); // fire only once
    clearTimeout(safetyTimeout);

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (userDoc.exists() && userDoc.data().role === 'admin') {
            // ✅ Valid admin — cache session, reveal UI, let admin.js start
            sessionStorage.setItem('admin_verified', user.uid);
            console.log('Admin privileges verified for', user.email);

            document.dispatchEvent(new CustomEvent('admin-verified', {
                detail: { user: { uid: user.uid, ...userDoc.data() } }
            }));

            hideLoader();

        } else {
            // ❌ Authenticated but not an admin
            console.error('Access denied: not an admin account');
            sessionStorage.removeItem('admin_verified');
            window.location.replace('./login.html');
        }

    } catch (error) {
        // Network / Firestore error — do NOT silently redirect;
        // show a message so the user knows what happened and can retry.
        console.error('Guard Firestore check failed:', error);
        sessionStorage.removeItem('admin_verified');
        showLoaderError('Verification failed. Check your connection and refresh.');
    }
});
