/**
 * ShopHub User Profile Logic - Module
 * Integration with Firebase Auth, Firestore, and Cloudinary
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signOut, updateProfile, 
    updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, updateDoc, collection, 
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
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqsvcn94y/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "shophub_profiles";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
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
                if (docSnap.exists()) {
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
    const fullName = firestoreData?.fullName || user.displayName || 'ShopHub User';
    const email = user.email;
    const profilePic = firestoreData?.profileImage || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0052cc&color=fff`;

    const nameEl = document.getElementById('user-fullname');
    const emailEl = document.getElementById('user-email');
    const avatarEl = document.getElementById('user-avatar');
    const inputNameEl = document.getElementById('full-name');
    const inputEmailEl = document.getElementById('email-address');

    if (nameEl) nameEl.innerText = fullName;
    if (emailEl) emailEl.innerText = email;
    if (avatarEl) avatarEl.src = profilePic;
    if (inputNameEl) inputNameEl.value = fullName;
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
            fileInput.click();
        });
    }

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        avatarImg.style.opacity = '0.5';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        try {
            const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
            const data = await response.json();
            
            if (data.secure_url) {
                const newUrl = data.secure_url;
                await updateProfile(auth.currentUser, { photoURL: newUrl });
                await updateDoc(doc(db, "users", auth.currentUser.uid), { profileImage: newUrl });
                avatarImg.src = newUrl;
            }
        } catch (error) {
            alert('Upload failed: ' + error.message);
        } finally {
            avatarImg.style.opacity = '1';
        }
    });
}

/**
 * Settings Form
 */
function setupSettingsForm() {
    const form = document.getElementById('settings-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('full-name').value;
        const newPassword = document.getElementById('current-password').value;

        try {
            // Update UI/Auth
            if (fullName !== auth.currentUser.displayName) {
                await updateProfile(auth.currentUser, { displayName: fullName });
            }

            // Update Firestore
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                fullName: fullName,
                updatedAt: new Date()
            });

            // Password update (Requires recent login, will error if not)
            if (newPassword) {
                await updatePassword(auth.currentUser, newPassword);
            }

            alert('Profile updated successfully!');
        } catch (error) {
            if (error.code === 'auth/requires-recent-login') {
                alert('Please re-login to change your password for security.');
            } else {
                alert('Update failed: ' + error.message);
            }
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

window.handleLogout = async () => {
    if (confirm('Are you sure you want to log out?')) {
        await signOut(auth);
        window.location.href = 'index.html';
    }
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
