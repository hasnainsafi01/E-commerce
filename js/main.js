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
    injectAuthModal();
    
    // Auth State Observer
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateNavbarUI(user);
        
        if (user) {
            syncCartWithFirestore(user.uid);
            // If on cart page, render it
            if (window.location.pathname.includes('cart.html')) {
                renderCart();
            }
        } else {
            cartState = [];
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
        document.getElementById('logout-btn').addEventListener('click', handleLogout);
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
                <button class="btn btn-social w-100" id="google-login">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" width="18" alt="Google">
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
                profileImage: null, role: 'user', createdAt: new Date(), lastLogin: new Date()
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
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const names = user.displayName ? user.displayName.split(' ') : ['User', ''];
        const firstName = names[0];
        const lastName = names.slice(1).join(' ');
        await setDoc(doc(db, "users", user.uid), {
            firstName, lastName, fullName: user.displayName,
            email: user.email, profileImage: user.photoURL, 
            role: 'user', lastLogin: new Date()
        }, { merge: true });
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.data().createdAt) {
            await updateDoc(doc(db, "users", user.uid), { createdAt: new Date() });
        }
        hideAuthModal();
    } catch (error) {
        alert('Google Login Failed: ' + error.message);
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
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Thank you for joining our community!');
            newsletterForm.reset();
        });
    }
}

