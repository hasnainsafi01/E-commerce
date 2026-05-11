/**
 * Chenari Admin Security Guard - Production Version
 * Handles Auth Verification & Role-Based Access Control (RBAC)
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Configuration (Synced with main app)
const firebaseConfig = {
    apiKey: "AIzaSyB51QUy-6JfhsIBAIET2wQxTc9Yp1RXekY",
    authDomain: "portfolio-8f1ca.firebaseapp.com",
    projectId: "portfolio-8f1ca",
    storageBucket: "portfolio-8f1ca.firebasestorage.app",
    messagingSenderId: "261283936769",
    appId: "1:261283936769:web:ce65b52a9dbc1df0f6de00"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Guard Execution
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // No user logged in -> Redirect to login
        console.warn("Unauthorized access: No user session found.");
        window.location.href = 'login.html';
        return;
    }

    try {
        // Fetch user document to check role
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists() && userDoc.data().role === 'admin') {
            // Verified Admin -> Dispatch event to admin.js
            const adminData = {
                uid: user.uid,
                email: user.email,
                ...userDoc.data()
            };
            
            document.dispatchEvent(new CustomEvent('admin-verified', {
                detail: { user: adminData }
            }));

            // Reveal UI
            document.body.classList.remove('admin-loading');
            const loader = document.getElementById('admin-loader');
            if (loader) loader.style.display = 'none';
            
            console.log("Admin verified successfully.");
        } else {
            // Logged in but not an admin -> Redirect to main site
            console.error("Access Denied: User does not have administrative privileges.");
            alert("Access Denied: Administrative privileges required.");
            window.location.href = '../index.html';
        }
    } catch (error) {
        console.error("Security Guard Error:", error);
        window.location.href = '../index.html';
    }
});
