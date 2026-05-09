/**
 * Admin Security Guard
 * Protects admin routes from unauthorized users.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let authTimeout;

onAuthStateChanged(auth, async (user) => {
    const loader = document.getElementById('admin-loader');
    
    // 1. Check if user is authenticated
    if (!user) {
        // Prevent false logouts during password update token refresh
        console.warn("Auth state null detected. Waiting for stabilization...");
        if (loader) {
            loader.style.display = 'flex';
            loader.classList.remove('hidden');
        }
        document.body.classList.add('admin-loading');

        authTimeout = setTimeout(() => {
            console.error("Unauthorized access: No session found. Redirecting...");
            sessionStorage.removeItem('admin_verified');
            window.location.replace('../index.html');
        }, 1500); // 1.5s stabilization window
        return;
    }

    // Cancel any pending redirect if session is recovered
    if (authTimeout) clearTimeout(authTimeout);

    try {
        // 2. Optimized Role Check: Use session cache only for UI speed, but ALWAYS verify with Firestore
        const isVerified = sessionStorage.getItem('admin_verified') === user.uid;
        
        // Fetch user document from Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists() && userDoc.data().role === 'admin') {
            // Success: Mark session as verified and reveal UI
            sessionStorage.setItem('admin_verified', user.uid);
            console.log("Admin privileges verified.");
            
            // Dispatch event for other scripts (like admin.js) to start
            document.dispatchEvent(new CustomEvent('admin-verified', { 
                detail: { user: { uid: user.uid, ...userDoc.data() } } 
            }));

            // Reveal UI immediately (behind loader) to prevent flicker when loader fades out
            document.body.classList.remove('admin-loading');

            if (loader) {
                loader.classList.add('hidden');
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 400); 
            }
        } else {
            // Failure: Not an admin
            console.error("Access Denied: Account lacks administrative privileges.");
            sessionStorage.removeItem('admin_verified');
            window.location.replace('../index.html');
        }
    } catch (error) {
        // Critical Error: Security breach or network failure
        console.error("Security System Error:", error);
        sessionStorage.removeItem('admin_verified');
        window.location.replace('../index.html');
    }
});
