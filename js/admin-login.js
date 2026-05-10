/**
 * Admin Login Logic
 * Handles email/password sign-in for admin users only.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const form = document.getElementById('admin-login-form');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const errorBox = document.getElementById('login-error');

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
}

function hideError() {
    errorBox.style.display = 'none';
    errorBox.textContent = '';
}

function setLoading(isLoading) {
    loginBtn.disabled = isLoading;
    loginBtn.innerHTML = isLoading
        ? '<i class="fas fa-spinner fa-spin"></i> Signing in...'
        : '<i class="fas fa-sign-in-alt"></i> Sign In';
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showError('Please enter your email and password.');
        return;
    }

    setLoading(true);

    try {
        // Step 1: Sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Step 2: Verify admin role in Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (userDoc.exists() && userDoc.data().role === 'admin') {
            // ✅ Verified admin — store session marker and redirect to dashboard
            sessionStorage.setItem('admin_verified', user.uid);
            window.location.replace('./index.html');
        } else {
            // ❌ Logged in but NOT an admin — sign out immediately
            await auth.signOut();
            sessionStorage.removeItem('admin_verified');
            showError('Access denied. This account does not have administrator privileges.');
        }

    } catch (error) {
        console.error('Admin login error:', error);
        let msg = 'Login failed. Please try again.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            msg = 'Incorrect email or password.';
        } else if (error.code === 'auth/too-many-requests') {
            msg = 'Too many failed attempts. Please try again later.';
        } else if (error.code === 'auth/network-request-failed') {
            msg = 'Network error. Please check your connection.';
        }
        showError(msg);
    } finally {
        setLoading(false);
    }
});
