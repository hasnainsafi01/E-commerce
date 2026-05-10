/**
 * ShopHub Core Logic - Module
 * Handles Authentication, Cart, and Global UI
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, 
    signOut, updateProfile 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, collection, 
    query, where, getDocs, onSnapshot 
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// State Management
let currentUser = null;
let cartState = [];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initSkeletons();
    loadProducts();
    setupSearch();
    setupNavbarScroll();
    setupNewsletter();
    setupHeroSlider();
    injectAuthModal();
    injectLogoutModal();
    injectToastContainer();
    
    // Auth State Observer
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateNavbarUI(user);
        
        if (user) {
            syncCartWithFirestore(user.uid);
            
            // Real-time Navbar Profile Image Sync
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    updateNavbarProfileImage(user, docSnap.data());
                } else {
                    updateNavbarProfileImage(user);
                }
            });

            // If on cart page, render it
            if (window.location.pathname.includes('cart.html')) {
                renderCart();
            }
        } else {
            cartState = [];
            // Reset navbar image on logout
            updateNavbarProfileImage(null);
            
            if (window.location.pathname.includes('cart.html')) {
                window.location.href = 'index.html';
            }
        }
    });
});

/**
 * Product Loading & Rendering
 */
async function loadProducts() {
    const grids = document.querySelectorAll('.product-grid');
    grids.forEach(async (grid) => {
        // Identify category from ID or data attribute
        const gridId = grid.id || '';
        const category = gridId.replace('-grid', '');
        
        if (!category) return;

        try {
            const q = query(collection(db, "products"), where("category", "==", category));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                // Keep skeletons as placeholders
                return;
            }

            renderProducts(grid, snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error(`Error loading ${category} products:`, error);
        }
    });
}

function renderProducts(grid, products) {
    grid.innerHTML = products.map(product => `
        <div class="product-card">
            <div class="product-image-container">
                <img src="${product.productImage}" alt="${product.productName}" class="product-image">
                <button class="wishlist-btn" onclick="handleAddToWishlist('${product.id}')">
                    <i class="far fa-heart"></i>
                </button>
            </div>
            <div class="product-info">
                <span class="product-category">${product.category}</span>
                <h3 class="product-title">${product.productName}</h3>
                <div class="product-footer">
                    <span class="product-price">$${parseFloat(product.productPrice).toFixed(2)}</span>
                    <button class="add-to-cart-btn" onclick='handleAddToCart(${JSON.stringify(product)})'>
                        <i class="fas fa-shopping-bag"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function initSkeletons() {
    const grids = document.querySelectorAll('.product-grid');
    grids.forEach(grid => {
        grid.innerHTML = '';
        const count = grid.hasAttribute('data-count') ? parseInt(grid.getAttribute('data-count')) : 8;
        for (let i = 0; i < count; i++) {
            const card = document.createElement('div');
            card.className = 'skeleton-card';
            card.innerHTML = `
                <div class="skeleton product-image-skeleton"></div>
                <div class="product-info-skeleton">
                    <div class="skeleton skeleton-cat"></div>
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-price"></div>
                    <div class="skeleton-actions">
                        <div class="skeleton skeleton-btn"></div>
                        <div class="skeleton skeleton-fav"></div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        }
    });
}

/**
 * Navbar UI Update
 */
async function updateNavbarUI(user) {
    const authButtons = document.querySelector('.auth-buttons');
    if (!authButtons) return;

    if (user) {
        // Check if admin
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const isAdmin = userDoc.exists() && userDoc.data().role === 'admin';
        
        authButtons.innerHTML = `
            ${isAdmin ? '<a href="admin/index.html" class="btn btn-outline" style="border-color: var(--primary); color: var(--primary);"><i class="fas fa-user-shield"></i> Admin</a>' : ''}
            <button class="btn btn-outline" id="logout-btn">Logout</button>
        `;
        document.getElementById('logout-btn').addEventListener('click', (e) => {
            e.preventDefault();
            window.showLogoutModal();
        });
    } else {
        authButtons.innerHTML = `
            <button class="btn btn-outline" id="login-trigger">Login</button>
            <button class="btn btn-primary" id="signup-trigger">Sign Up</button>
        `;
        document.getElementById('login-trigger').addEventListener('click', () => showAuthModal());
        document.getElementById('signup-trigger').addEventListener('click', () => showAuthModal(true));
    }

    // Global protection for Profile and Cart links
    document.querySelectorAll('.nav-item').forEach(item => {
        const text = item.innerText.toLowerCase();
        if (text.includes('profile') || text.includes('cart')) {
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            
            newItem.addEventListener('click', (e) => {
                e.preventDefault();
                if (!currentUser) {
                    showAuthModal();
                } else {
                    if (text.includes('profile')) window.location.href = 'profile.html';
                    if (text.includes('cart')) window.location.href = 'cart.html';
                }
            });
        }
    });
}

/**
 * Update Navbar Profile Image Dynamically
 */
function updateNavbarProfileImage(user, firestoreData = null) {
    const navItem = Array.from(document.querySelectorAll('.nav-item')).find(item => 
        item.innerText.toLowerCase().includes('profile')
    );
    if (!navItem) return;

    const iconContainer = navItem.querySelector('i') || navItem.querySelector('img');
    if (!iconContainer) return;

    if (!user) {
        // Reset to default icon
        const icon = document.createElement('i');
        icon.className = 'far fa-user';
        iconContainer.replaceWith(icon);
        return;
    }

    // Priority: Firestore photoURL > Auth photoURL > Default Avatar
    const fullName = firestoreData?.fullName || user.displayName || 'User';
    const profilePic = firestoreData?.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0052cc&color=fff`;

    const img = document.createElement('img');
    img.src = profilePic;
    img.className = 'nav-profile-img';
    img.alt = 'Profile';
    
    iconContainer.replaceWith(img);
}

/**
 * Auth Modal Logic
 */
function injectAuthModal() {
    if (document.getElementById('authModal')) return;
    const modalHTML = `
        <div class="modal-overlay" id="authModal">
            <div class="modal-content auth-modal">
                <i class="fas fa-times modal-close" id="close-auth"></i>
                <div class="auth-header">
                    <h2 id="auth-title">Welcome Back</h2>
                    <p id="auth-subtitle">Please login to continue your shopping experience</p>
                </div>
                <form id="auth-form" class="auth-form">
                    <div class="form-group" id="name-fields" style="display: none;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                            <input type="text" id="first-name" placeholder="First Name">
                            <input type="text" id="last-name" placeholder="Last Name">
                        </div>
                    </div>
                    <div class="form-group">
                        <input type="email" id="auth-email" placeholder="Email Address" required>
                    </div>
                    <div class="form-group">
                        <input type="password" id="auth-password" placeholder="Password" required>
                    </div>
                    <div class="form-group" id="confirm-pass-field" style="display: none;">
                        <input type="password" id="auth-confirm-password" placeholder="Confirm Password">
                    </div>
                    <div id="auth-error" class="auth-error"></div>
                    <button type="submit" class="btn btn-primary w-100" id="auth-submit-btn">Login</button>
                </form>
                <div class="auth-divider"><span>OR</span></div>
                <button class="btn btn-social w-100" id="google-login" aria-label="Continue with Google">
                    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                </button>
                <p class="auth-switch">
                    <span id="switch-text">Don't have an account?</span>
                    <a href="#" id="switch-auth-mode">Sign Up</a>
                </p>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('close-auth').addEventListener('click', hideAuthModal);
    document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
    document.getElementById('google-login').addEventListener('click', handleGoogleLogin);
    document.getElementById('switch-auth-mode').addEventListener('click', toggleAuthMode);
}

/**
 * Logout Modal Logic
 */
function injectLogoutModal() {
    if (document.getElementById('logoutModal')) return;
    const modalHTML = `
        <div class="modal-overlay" id="logoutModal">
            <div class="modal-content logout-modal">
                <div class="logout-icon">
                    <i class="fas fa-sign-out-alt"></i>
                </div>
                <div class="auth-header">
                    <h2>Logout Confirmation</h2>
                    <p>Are you sure you want to log out of your ShopHub account?</p>
                </div>
                <div class="logout-actions">
                    <button class="btn btn-outline" id="cancel-logout">Cancel</button>
                    <button class="btn btn-primary" id="confirm-logout">Confirm Logout</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('cancel-logout').addEventListener('click', hideLogoutModal);
    document.getElementById('confirm-logout').addEventListener('click', async () => {
        const confirmBtn = document.getElementById('confirm-logout');
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
        confirmBtn.disabled = true;
        await handleLogout();
    });
}

window.showLogoutModal = () => {
    const modal = document.getElementById('logoutModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function hideLogoutModal() {
    const modal = document.getElementById('logoutModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Global Toast System
 */
function injectToastContainer() {
    if (document.getElementById('toast-container')) return;
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
}

window.showToast = (message, type = 'success', duration = 5000) => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${icons[type] || icons.info}"></i>
        </div>
        <div class="toast-content">
            <p>${message}</p>
        </div>
        <button class="toast-close" aria-label="Close notification">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);

    // Auto hide
    const timer = setTimeout(() => {
        dismissToast(toast);
    }, duration);

    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(timer);
        dismissToast(toast);
    });
}

function dismissToast(toast) {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => {
        toast.remove();
    });
}

let isSignUpMode = false;
window.showAuthModal = (signup = false) => {
    isSignUpMode = signup;
    const modal = document.getElementById('authModal');
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const nameFields = document.getElementById('name-fields');
    const confirmPassField = document.getElementById('confirm-pass-field');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchText = document.getElementById('switch-text');
    const switchLink = document.getElementById('switch-auth-mode');
    const errorMsg = document.getElementById('auth-error');

    errorMsg.innerText = '';
    if (isSignUpMode) {
        title.innerText = 'Create Account';
        subtitle.innerText = 'Join ShopHub today for exclusive deals';
        nameFields.style.display = 'block';
        confirmPassField.style.display = 'block';
        submitBtn.innerText = 'Sign Up';
        switchText.innerText = 'Already have an account?';
        switchLink.innerText = 'Login';
    } else {
        title.innerText = 'Welcome Back';
        subtitle.innerText = 'Please login to continue your shopping experience';
        nameFields.style.display = 'none';
        confirmPassField.style.display = 'none';
        submitBtn.innerText = 'Login';
        switchText.innerText = 'Don\'t have an account?';
        switchLink.innerText = 'Sign Up';
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function toggleAuthMode(e) {
    e.preventDefault();
    showAuthModal(!isSignUpMode);
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorMsg = document.getElementById('auth-error');
    errorMsg.innerText = '';

    try {
        if (isSignUpMode) {
            const firstName = document.getElementById('first-name').value;
            const lastName = document.getElementById('last-name').value;
            const confirmPassword = document.getElementById('auth-confirm-password').value;

            if (!firstName || !lastName) throw new Error('Please enter your full name');
            if (password !== confirmPassword) throw new Error('Passwords do not match');
            if (password.length < 6) throw new Error('Password must be at least 6 characters');

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const fullName = `${firstName} ${lastName}`;
            await updateProfile(user, { displayName: fullName });
            await setDoc(doc(db, "users", user.uid), {
                firstName, lastName, fullName, email,
                photoURL: null, role: 'user', createdAt: new Date(), lastLogin: new Date()
            });
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        hideAuthModal();
    } catch (error) {
        errorMsg.innerText = error.message;
    }
}

async function handleGoogleLogin() {
    const googleBtn = document.getElementById('google-login');
    const errorMsg = document.getElementById('auth-error');
    const originalContent = googleBtn.innerHTML;
    
    try {
        errorMsg.innerText = '';
        googleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        googleBtn.disabled = true;

        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        // Prepare user data
        const names = user.displayName ? user.displayName.split(' ') : ['User', ''];
        const firstName = names[0];
        const lastName = names.slice(1).join(' ');
        
        const userData = {
            firstName,
            lastName,
            fullName: user.displayName || 'ShopHub User',
            email: user.email,
            photoURL: user.photoURL,
            role: 'user',
            lastLogin: new Date(),
            updatedAt: new Date()
        };

        // Create/Update Firestore document
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
            userData.createdAt = new Date();
            await setDoc(userRef, userData);
        } else {
            await updateDoc(userRef, {
                ...userData,
                lastLogin: new Date()
            });
        }

        hideAuthModal();
        // Feedback
        console.log('Google login successful');
        
    } catch (error) {
        console.error('Google Login Error:', error);
        
        let customMessage = 'Google Sign-In failed. Please try again.';
        
        if (error.code === 'auth/unauthorized-domain') {
            customMessage = 'Domain unauthorized. Please add this domain to Firebase Authorized Domains in the console.';
        } else if (error.code === 'auth/popup-closed-by-user') {
            customMessage = 'Sign-in cancelled. Please keep the popup open to continue.';
        } else if (error.code === 'auth/network-request-failed') {
            customMessage = 'Network error. Please check your internet connection.';
        }
        
        errorMsg.innerText = customMessage;
    } finally {
        googleBtn.innerHTML = originalContent;
        googleBtn.disabled = false;
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function syncCartWithFirestore(uid) {
    onSnapshot(doc(db, "cart", uid), (doc) => {
        if (doc.exists()) {
            cartState = doc.data().products || [];
        } else {
            cartState = [];
        }
        if (window.location.pathname.includes('cart.html')) {
            renderCart();
        }
    });
}

async function updateFirestoreCart() {
    if (!currentUser) return;
    await setDoc(doc(db, "cart", currentUser.uid), {
        products: cartState, updatedAt: new Date()
    });
}

window.openCart = () => {
    if (!currentUser) showAuthModal();
    else window.location.href = 'cart.html';
};

window.handleAddToCart = async (product) => {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    const existing = cartState.find(p => p.id === product.id);
    if (existing) existing.qty++;
    else cartState.push({ ...product, qty: 1 });
    await updateFirestoreCart();
    alert('Product added to cart!');
};

/**
 * Wishlist Logic
 */
window.handleAddToWishlist = async (productId) => {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    try {
        // Fetch product data first
        const pDoc = await getDoc(doc(db, "products", productId));
        if (!pDoc.exists()) return;
        const product = pDoc.data();

        await setDoc(doc(db, "wishlist", `${currentUser.uid}_${productId}`), {
            userId: currentUser.uid,
            productId: productId,
            name: product.productName,
            price: product.productPrice,
            image: product.productImage,
            addedAt: new Date()
        });
        alert('Item added to wishlist!');
    } catch (error) {
        console.error("Error adding to wishlist:", error);
    }
};

/**
 * Cart Rendering & Actions
 */
function renderCart() {
    const list = document.getElementById('cart-items-list');
    const summaryCount = document.getElementById('summary-count');
    const summarySubtotal = document.getElementById('summary-subtotal');
    const summaryTotal = document.getElementById('summary-total');

    if (!list) return;

    if (cartState.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="padding: 3rem 0;">
                <i class="fas fa-shopping-cart"></i>
                <h3>Your cart is empty</h3>
                <p>Looks like you haven't added anything yet.</p>
                <a href="index.html" class="btn btn-primary" style="margin-top: 1rem; display: inline-block;">Start Shopping</a>
            </div>
        `;
        if (summaryCount) summaryCount.innerText = '(0 items)';
        if (summarySubtotal) summarySubtotal.innerText = '$0.00';
        if (summaryTotal) summaryTotal.innerText = '$0.00';
        return;
    }

    let subtotal = 0;
    list.innerHTML = cartState.map((item, index) => {
        subtotal += item.productPrice * item.qty;
        return `
            <div class="cart-item">
                <img src="${item.productImage}" alt="${item.productName}" class="cart-item-img">
                <div class="cart-item-details">
                    <h3>${item.productName}</h3>
                    <p class="cart-item-category">${item.category}</p>
                    <div class="cart-item-actions">
                        <div class="qty-control">
                            <button onclick="updateCartQty(${index}, -1)">-</button>
                            <span>${item.qty}</span>
                            <button onclick="updateCartQty(${index}, 1)">+</button>
                        </div>
                        <button class="remove-item" onclick="removeCartItem(${index})">
                            <i class="far fa-trash-alt"></i> Remove
                        </button>
                    </div>
                </div>
                <div class="cart-item-price">$${(item.productPrice * item.qty).toFixed(2)}</div>
            </div>
        `;
    }).join('');

    if (summaryCount) summaryCount.innerText = `(${cartState.length} items)`;
    if (summarySubtotal) summarySubtotal.innerText = `$${subtotal.toFixed(2)}`;
    if (summaryTotal) summaryTotal.innerText = `$${subtotal.toFixed(2)}`;
}

window.updateCartQty = async (index, delta) => {
    if (cartState[index].qty + delta > 0) {
        cartState[index].qty += delta;
        await updateFirestoreCart();
    }
};

window.removeCartItem = async (index) => {
    cartState.splice(index, 1);
    await updateFirestoreCart();
};

window.clearCart = async () => {
    if (confirm('Clear all items from cart?')) {
        cartState = [];
        await updateFirestoreCart();
    }
};

window.handleCheckout = async () => {
    if (!currentUser || cartState.length === 0) return;

    try {
        const total = cartState.reduce((acc, item) => acc + (item.productPrice * item.qty), 0);
        const orderData = {
            userId: currentUser.uid,
            userName: currentUser.displayName,
            userEmail: currentUser.email,
            items: cartState,
            total: total,
            status: 'processing',
            createdAt: new Date()
        };

        const ordersRef = collection(db, "orders");
        await addDoc(ordersRef, orderData);

        // Clear cart after order
        cartState = [];
        await updateFirestoreCart();
        
        alert('Order placed successfully! Redirecting to your profile...');
        window.location.href = 'profile.html';
    } catch (error) {
        alert('Checkout failed: ' + error.message);
    }
};

// ... Utility functions ...
function setupNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.style.padding = '0.5rem 0';
                navbar.style.boxShadow = 'var(--shadow-md)';
            } else {
                navbar.style.padding = '0.75rem 0';
                navbar.style.boxShadow = 'none';
            }
        });
    }
}

function setupSearch() {
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) searchBar.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') console.log('Searching for:', searchBar.value);
    });
}

function setupNewsletter() {
    const form = document.querySelector('.newsletter-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = form.querySelector('input').value;
            alert(`Thank you for subscribing with ${email}!`);
            form.reset();
        });
    }
}

/**
 * Hero Slider Logic
 */
function setupHeroSlider() {
    const slider = document.getElementById('hero-slider');
    if (!slider) return;

    const slides = slider.querySelectorAll('.hero-slide');
    const dotsContainer = document.getElementById('hero-dots');
    if (!slides.length || !dotsContainer) return;

    let currentSlide = 0;
    let slideInterval;

    // Create dots
    slides.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = `hero-dot ${index === 0 ? 'active' : ''}`;
        dot.addEventListener('click', () => goToSlide(index));
        dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll('.hero-dot');

    window.goToSlide = (index) => {
        slides[currentSlide].classList.remove('active');
        dots[currentSlide].classList.remove('active');
        
        currentSlide = index;
        
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
        
        resetInterval();
    };

    window.nextSlide = () => {
        let next = (currentSlide + 1) % slides.length;
        goToSlide(next);
    };

    window.prevSlide = () => {
        let prev = (currentSlide - 1 + slides.length) % slides.length;
        goToSlide(prev);
    };

    function startInterval() {
        slideInterval = setInterval(window.nextSlide, 4500); // 4.5 seconds
    }

    function resetInterval() {
        clearInterval(slideInterval);
        startInterval();
    }

    startInterval();
}
