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
    
    if (!user) {
        console.warn("No authenticated user found. Redirecting to home...");
        window.location.replace('../index.html');
        return;
    }

    try {
        // Fetch user document to check role
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists() && userDoc.data().role === 'admin') {
            console.log("Admin access granted.");
            
            // Success: Remove loading state and reveal content
            if (loader) {
                loader.classList.add('hidden');
                setTimeout(() => {
                    loader.style.display = 'none';
                    document.body.classList.remove('admin-loading');
                }, 400); // Match CSS transition
            } else {
                document.body.classList.remove('admin-loading');
            }
        } else {
            console.error("Access denied: User does not have admin privileges.");
            window.location.replace('../index.html');
        }
    } catch (error) {
        console.error("Security verification failed:", error);
        window.location.replace('../index.html');
    }
});
