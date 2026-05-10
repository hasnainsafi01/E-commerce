/**
 * MyMart User Profile Logic - Module
 * Integration with Firebase Auth, Firestore, and Cloudinary
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signOut, updateProfile, 
    updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, updateDoc, setDoc, collection, 
    query, where, getDocs, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyB51QUy-6JfhsIBAIET2wQxTc9Yp1RXekY",
    authDomain: "portfolio-8f1ca.firebaseapp.com",
    projectId: "portfolio-8f1ca",
    storageBucket: "portfolio-8f1ca.firebasestorage.app",
    messagingSenderId: "261283936769",
    appId: "1:261283936769:web:ce65b52a9dbc1df0f6de00"
};

// Cloudinary Configuration
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dxpmh3rf6/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "E-commerce";
const CLOUDINARY_FOLDER = "E-commerce";

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State
let currentUser = null;

// Initialize Profile Page
document.addEventListener('DOMContentLoaded', () => {
    setupSidebarNav();
    monitorAuthState();
    setupAvatarUpload();
    setupSettingsForm();
});

/**
 * Authentication Monitoring
 */
function monitorAuthState() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            updateUIWithUserData(user);
            
            // Listen for Firestore updates
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                // Prevent premature UI updates by ignoring local optimistic writes
                if (docSnap.exists() && !docSnap.metadata.hasPendingWrites) {
                    updateUIWithUserData(user, docSnap.data());
                }
            });

            fetchUserOrders(user.uid);
            fetchUserWishlist(user.uid);
            // fetchCartHistory(user.uid);
        } else {
            window.location.href = 'index.html';
        }
    });
}

/**
 * UI Updates
 */
function updateUIWithUserData(user, firestoreData = null) {
    const firstName = firestoreData?.firstName || '';
    const lastName = firestoreData?.lastName || '';
    const fullName = (firstName && lastName) ? `${firstName} ${lastName}` : (user.displayName || 'MyMart User');
    const email = user.email;
    
    // Priority Logic: 1. Firestore photoURL (Uploaded/Synced) > 2. Firebase Auth photoURL > 3. UI-Avatar
    const profilePic = firestoreData?.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0052cc&color=fff`;

    // UI Elements
    const nameEl = document.getElementById('user-fullname');
    const emailEl = document.getElementById('user-email');
    const avatarEl = document.getElementById('user-avatar');
    
    // Settings inputs
    const inputFirstNameEl = document.getElementById('first-name-input');
    const inputLastNameEl = document.getElementById('last-name-input');
    const inputEmailEl = document.getElementById('email-address');

    if (nameEl) nameEl.innerText = fullName;
    if (emailEl) emailEl.innerText = email;
    if (avatarEl) avatarEl.src = profilePic;
    
    if (inputFirstNameEl) inputFirstNameEl.value = firstName;
    if (inputLastNameEl) inputLastNameEl.value = lastName;
    if (inputEmailEl) inputEmailEl.value = email;

    // Update member date
    const memberBadge = document.getElementById('member-since');
    if (memberBadge) {
        let createdAt = firestoreData?.createdAt;
        if (createdAt) {
            const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
            memberBadge.innerText = `Member since ${date.getFullYear()}`;
        } else {
            memberBadge.innerText = `Member since ${new Date().getFullYear()}`;
        }
    }
}

/**
 * Sidebar Navigation
 */
function setupSidebarNav() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            const sectionId = link.getAttribute('data-section');
            showSection(sectionId);
            sidebarLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

window.showSection = (sectionId) => {
    const sections = document.querySelectorAll('.profile-section');
    sections.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`${sectionId}-section`);
    if (target) target.classList.add('active');
};

/**
 * Avatar Upload
 */
function setupAvatarUpload() {
    const fileInput = document.getElementById('avatar-upload');
    const avatarImg = document.getElementById('user-avatar');
    const editBtn = document.querySelector('.edit-avatar-btn');

    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
    }

    // Make the avatar container itself clickable
    const container = document.querySelector('.profile-avatar-container');
    if (container) {
        container.style.cursor = 'pointer';
        container.addEventListener('click', () => {
            fileInput.click();
        });
    }

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            window.showToast('Please upload only JPG, PNG, or WEBP images.', 'error');
            return;
        }

        // Show loading state
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'avatar-loading-overlay';
        loadingOverlay.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        container.appendChild(loadingOverlay);
        avatarImg.style.filter = 'blur(2px)';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', CLOUDINARY_FOLDER);

        try {
            const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Cloudinary upload failed');
            
            const data = await response.json();
            
            if (data.secure_url) {
                const newUrl = data.secure_url;
                
                // Update Firebase Auth Profile
                await updateProfile(auth.currentUser, { photoURL: newUrl });
                
                // Update Firestore User Document
                const userRef = doc(db, "users", auth.currentUser.uid);
                await updateDoc(userRef, { 
                    photoURL: newUrl,
                    updatedAt: new Date()
                });

                // Update UI instantly
                avatarImg.src = newUrl;
                
                console.log('Profile image updated successfully');
                window.showToast('Profile image updated successfully!');
            }
        } catch (error) {
            console.error('Upload error:', error);
            window.showToast('Upload failed: ' + error.message, 'error');
        } finally {
            if (loadingOverlay) loadingOverlay.remove();
            avatarImg.style.filter = 'none';
        }
    });
}

/**
 * Settings Form
 */
function setupSettingsForm() {
    const form = document.getElementById('settings-form');
    if (!form) return;

    const saveBtn = document.getElementById('save-settings-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const firstName = document.getElementById('first-name-input').value.trim();
        const lastName = document.getElementById('last-name-input').value.trim();
        const fullName = `${firstName} ${lastName}`.trim();
        
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!firstName || !lastName) {
            window.showToast('Please fill in both First and Last names.', 'error');
            return;
        }

        if (saveBtn.disabled) return; // Prevent double submission

        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        try {
            // 1. Update Profile (Firestore + Auth)
            const userRef = doc(db, "users", auth.currentUser.uid);
            await setDoc(userRef, {
                firstName,
                lastName,
                updatedAt: new Date()
            }, { merge: true });

            if (fullName !== auth.currentUser.displayName) {
                await updateProfile(auth.currentUser, { displayName: fullName });
            }

            // 2. Handle Password Change if requested
            if (newPassword) {
                if (!currentPassword) {
                    throw new Error('Current password is required to change your password.');
                }
                if (newPassword.length < 6) {
                    throw new Error('New password must be at least 6 characters long.');
                }
                if (newPassword !== confirmPassword) {
                    throw new Error('New passwords do not match.');
                }

                // Re-authenticate
                const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
                await reauthenticateWithCredential(auth.currentUser, credential);
                
                // Update Password
                await updatePassword(auth.currentUser, newPassword);

                // CRITICAL: Force sign-out after password change.
                // Firebase revokes the old token, making the session unstable.
                // Signing out immediately prevents the admin guard from flipping
                // between authenticated/unauthenticated on subsequent page loads.
                await signOut(auth);
                sessionStorage.removeItem('admin_verified');
                window.showToast('Password changed. Please log in again.', 'success');
                setTimeout(() => {
                    // Redirect admin users back to admin login, regular users to home
                    const isAdmin = window.location.pathname.includes('profile.html');
                    window.location.href = 'index.html';
                }, 2000);
                return; // Stop further execution in this submit handler

                // Clear password fields (reached only on non-password saves)
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            }

            // 3. Update UI locally ONLY AFTER all saves complete successfully
            const nameEl = document.getElementById('user-fullname');
            if (nameEl) nameEl.innerText = fullName;

            window.showToast('Profile updated successfully!', 'success');
            
        } catch (error) {
            console.error('Settings update error:', error);
            let msg = error.message;
            if (error.code === 'auth/wrong-password') msg = 'Current password is incorrect.';
            if (error.code === 'auth/requires-recent-login') msg = 'Please re-login to update your password.';
            window.showToast(msg, 'error');
        } finally {
            saveBtn.innerHTML = 'Save Changes';
            saveBtn.disabled = false;
        }
    });
}

/**
 * Orders & Wishlist
 */
async function fetchUserOrders(uid) {
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;

    const q = query(collection(db, "orders"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <h3>No orders yet</h3>
                    <p>When you buy something, it will appear here.</p>
                </div>
            `;
            return;
        }
        
        ordersList.innerHTML = snapshot.docs.map(doc => {
            const order = doc.data();
            const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Recently';
            return `
                <div class="order-card">
                    <div class="order-main">
                        <img src="${order.items?.[0]?.image || 'https://via.placeholder.com/80'}" class="order-img">
                        <div class="order-details">
                            <h3>${order.items?.[0]?.name || 'Product'}</h3>
                            <p class="order-id">Order #${doc.id.substring(0, 8)}</p>
                            <p class="order-date">${date}</p>
                        </div>
                        <div class="order-status-price">
                            <span class="price">$${order.total?.toFixed(2) || '0.00'}</span>
                            <span class="status-badge ${order.status || 'processing'}">${order.status || 'Processing'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    });
}

async function fetchUserWishlist(uid) {
    const grid = document.getElementById('saved-items-grid');
    if (!grid) return;

    onSnapshot(query(collection(db, "wishlist"), where("userId", "==", uid)), (snapshot) => {
        if (snapshot.empty) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="far fa-heart"></i>
                    <h3>Your wishlist is empty</h3>
                    <p>Save items you like to see them here.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = snapshot.docs.map(doc => {
            const item = doc.data();
            return `
                <div class="product-card">
                    <img src="${item.image}" style="width:100%; border-radius:8px;">
                    <div style="padding:10px 0;">
                        <h4>${item.name}</h4>
                        <p>$${item.price.toFixed(2)}</p>
                        <button class="btn btn-outline btn-sm w-100" onclick="removeFromWishlist('${doc.id}')">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
    });
}

window.handleLogout = () => {
    window.showLogoutModal();
};

window.trackOrder = async (id) => {
    document.getElementById('tracking-id-val').innerText = `#${id}`;
    showSection('tracking');
    
    const timeline = document.getElementById('tracking-timeline');
    if (!timeline) return;

    // Fetch tracking details from Firestore (Stub for now)
    const orderDoc = await getDoc(doc(db, "orders", id));
    if (orderDoc.exists() && orderDoc.data().tracking) {
        const tracking = orderDoc.data().tracking;
        timeline.innerHTML = tracking.map(step => `
            <div class="timeline-item ${step.status}">
                <div class="timeline-icon"><i class="fas ${step.icon}"></i></div>
                <div class="timeline-content">
                    <h4>${step.title}</h4>
                    <p>${step.time || ''}</p>
                </div>
            </div>
        `).join('');
    }
};

window.scrollToSettings = () => {
    document.querySelector('.sidebar-link[data-section="settings"]').click();
};
