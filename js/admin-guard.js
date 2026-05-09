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

onAuthStateChanged(auth, async (user) => {
    const loader = document.getElementById('admin-loader');
    
    // 1. Check if user is authenticated
    if (!user) {
        console.warn("Unauthorized access: No session found. Redirecting...");
        sessionStorage.removeItem('admin_verified');
        window.location.replace('../index.html');
        return;
    }

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
            if (loader) {
                loader.classList.add('hidden');
                setTimeout(() => {
                    loader.style.display = 'none';
                    document.body.classList.remove('admin-loading');
                }, 400); 
            } else {
                document.body.classList.remove('admin-loading');
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
