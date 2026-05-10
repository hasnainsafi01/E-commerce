/**
 * Admin Security Guard
 * Protects admin routes from unauthorized users.
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

// FIX: Reuse existing Firebase app instead of calling initializeApp() twice
// (admin.js also calls initializeApp — second call causes "duplicate-app" crash)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loader = document.getElementById('admin-loader');
const loaderMsg = loader ? loader.querySelector('p') : null;

// Safety net: if Firebase never resolves (offline / CDN blocked), 
// stop spinning and show a user-friendly error after 8 seconds
const safetyTimeout = setTimeout(() => {
    if (loader && !loader.classList.contains('hidden')) {
        if (loaderMsg) loaderMsg.textContent = 'Verification timed out. Please refresh the page.';
        console.error('Admin guard: auth state never resolved within 8s.');
    }
}, 8000);

// FIX: Track whether we've already processed a valid user
// to avoid double-firing on token refreshes
let authHandled = false;
let nullRedirectTimer = null;

onAuthStateChanged(auth, async (user) => {

    // --- NO USER ---
    if (!user) {
        // Firebase briefly emits null on page refresh before restoring the session.
        // We wait 3s (up from 1.5s) to give it time to recover on slow/hosted connections.
        if (!nullRedirectTimer) {
            nullRedirectTimer = setTimeout(() => {
                if (!authHandled) {
                    clearTimeout(safetyTimeout);
                    sessionStorage.removeItem('admin_verified');
                    window.location.replace('../index.html');
                }
            }, 3000);
        }
        return;
    }

    // --- USER EXISTS: cancel any pending redirect and safety timeout ---
    if (nullRedirectTimer) clearTimeout(nullRedirectTimer);
    if (authHandled) return; // Ignore repeated fires (token refresh etc.)
    authHandled = true;
    clearTimeout(safetyTimeout);

    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists() && userDoc.data().role === 'admin') {
            // ✅ Verified admin — unlock the UI
            sessionStorage.setItem('admin_verified', user.uid);
            console.log("Admin privileges verified.");

            // Dispatch event so admin.js can start loading dashboard data
            document.dispatchEvent(new CustomEvent('admin-verified', {
                detail: { user: { uid: user.uid, ...userDoc.data() } }
            }));

            document.body.classList.remove('admin-loading');

            if (loader) {
                loader.classList.add('hidden');
                setTimeout(() => { loader.style.display = 'none'; }, 400);
            }

        } else {
            // ❌ Logged in but not an admin
            console.error("Access Denied: Account lacks administrative privileges.");
            sessionStorage.removeItem('admin_verified');
            window.location.replace('../index.html');
        }

    } catch (error) {
        // Network / Firestore error — show message instead of crashing or redirecting
        console.error("Security System Error:", error);
        sessionStorage.removeItem('admin_verified');
        if (loaderMsg) loaderMsg.textContent = 'Verification failed. Please check your connection and refresh.';
        // Reset so a manual refresh can try again
        authHandled = false;
    }
});

