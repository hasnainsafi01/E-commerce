/**
 * Chenari.com Core Logic - Module
 * Handles Authentication, Cart, and Global UI
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, 
    signOut, updateProfile 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, collection, 
    query, where, getDocs, onSnapshot, orderBy, limit 
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
// Initialize Firebase safely
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
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
    if (window.location.pathname.includes('product-details.html')) {
        loadProductDetails();
    }
    injectAuthModal();
    injectLogoutModal();
    injectToastContainer();
    
    // Auth State Observer
    onAuthStateChanged(auth, async (user) => {
        const wasLoggedOut = !currentUser;
        currentUser = user;
        
        // Only cleanup overlays when user actually logs in (auth state transition)
        if (user && wasLoggedOut) {
            cleanupAllOverlays();
        }
        
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

// Map grid IDs → Firestore category names (including homepage special grids)
const GRID_CATEGORY_MAP = {
    'shoes-grid':            'shoes',
    'bags-grid':             'bags',
    'watches-grid':          'watches',
    'glasses-grid':          'glasses',
    'men-grid':              'men',
    'women-grid':            'women',
    'electronics-grid':      'electronics',
    'essentials-grid':       'essentials',
    'trending-grid':         'trending',
    'clothing-grid':         'clothing',
    'new-arrivals':          'new',   // special handling in loadProducts
    'featured-categories':   null,    // broad mix
};

async function loadProducts() {
    const grids = document.querySelectorAll('.product-grid');

    for (const grid of grids) {
        const gridId = grid.id || '';
        if (!gridId || gridId === 'related-products' || gridId === 'saved-items-grid') continue;

        const limitCount = grid.hasAttribute('data-count') ? parseInt(grid.getAttribute('data-count')) : 8;
        const category = GRID_CATEGORY_MAP[gridId];

        // Inject skeleton placeholders while Firestore loads
        if (window.Loader && window.Loader.skeleton) {
            window.Loader.skeleton(grid, limitCount);
        }

        let q;
        if (category === 'new') {
            q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(limitCount));
        } else if (category) {
            q = query(collection(db, 'products'), where('category', '==', category), limit(limitCount));
        } else {
            q = query(collection(db, 'products'), limit(20));
        }

        // Use onSnapshot for real-time updates
        onSnapshot(q, (snapshot) => {
            let products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            if (!category && !gridId.includes('new-arrivals')) {
                // Shuffle for generic mix (Featured)
                products = products.sort(() => Math.random() - 0.5).slice(0, limitCount);
            }

            if (products.length > 0) {
                renderProducts(grid, products);
            }
        }, (error) => {
            console.error(`Error syncing products for grid "${gridId}":`, error);
        });
    }
}

// Resolve the correct path to product-details.html from ANY page depth
function getProductDetailsUrl(productId) {
    // Check if we're inside a subdirectory (e.g., admin/)
    const isSubdir = window.location.pathname.includes('/admin/');
    const prefix = isSubdir ? '../' : '';
    return `${prefix}product-details.html?id=${encodeURIComponent(productId)}`;
}

// Make navigateToProduct globally accessible for inline onclick
window.navigateToProduct = function(productId) {
    window.location.href = getProductDetailsUrl(productId);
};

function renderProducts(grid, products) {
    grid.innerHTML = products.map(p => {
        const productUrl = getProductDetailsUrl(p.id);
        const imageUrl = p.imageUrl || p.productImage || ''; // Support both names
        return `
        <a href="${productUrl}" class="product-card" style="text-decoration: none; color: inherit; display: block;">
            <div class="product-image-container">
                <img src="${imageUrl}" alt="${p.name || p.productName || 'Product'}" class="product-image" loading="lazy">
                <button class="wishlist-btn" onclick="event.preventDefault(); event.stopPropagation(); handleAddToWishlist('${p.id}')">
                    <i class="far fa-heart"></i>
                </button>
            </div>
            <div class="product-info">
                <span class="product-category">${p.category || ''}</span>
                <h3 class="product-title">${p.name || p.productName || 'Unnamed Product'}</h3>
                <div class="product-footer">
                    <span class="product-price">$${parseFloat(p.price || p.productPrice || 0).toFixed(2)}</span>
                    <button class="add-to-cart-btn" onclick='event.preventDefault(); event.stopPropagation(); handleAddToCart(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
                        <i class="fas fa-shopping-bag"></i>
                    </button>
                </div>
            </div>
        </a>`;
    }).join('');
}

/**
 * Product Details Loading
 */
async function loadProductDetails() {
    const params = new URLSearchParams(window.location.search);
    const id = decodeURIComponent(params.get('id') || '');
    if (!id) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const productDoc = await getDoc(doc(db, "products", id));
        if (!productDoc.exists()) {
            window.showToast('Product not found', 'error');
            setTimeout(() => window.location.href = 'index.html', 1500);
            return;
        }

        const p = { id: productDoc.id, ...productDoc.data() };

        // 1. Update Gallery (Supports multiple images)
        const gallery = document.querySelector('.product-gallery');
        if (gallery) {
            const images = p.images && p.images.length > 0 ? p.images : [p.imageUrl || p.productImage || ''];
            gallery.innerHTML = `
                <div class="main-image-container">
                    <img src="${images[0]}" id="main-product-img" alt="${p.productName || p.name}" style="width: 100%; border-radius: var(--radius-lg); object-fit: cover; transition: opacity 0.3s ease;">
                </div>
                <div class="thumbnail-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; margin-top: 1rem;">
                    ${images.map((img, i) => `
                        <img src="${img}" class="thumb ${i === 0 ? 'active' : ''}" style="width: 100%; aspect-ratio: 1; border-radius: var(--radius-md); cursor: pointer; border: 2px solid ${i === 0 ? 'var(--primary)' : 'transparent'}; object-fit: cover;" onclick="updateMainImage('${img}', this)">
                    `).join('')}
                </div>
            `;
            window.updateMainImage = (src, thumb) => {
                const main = document.getElementById('main-product-img');
                main.style.opacity = '0';
                setTimeout(() => {
                    main.src = src;
                    main.style.opacity = '1';
                }, 200);
                document.querySelectorAll('.thumb').forEach(t => t.style.borderColor = 'transparent');
                thumb.style.borderColor = 'var(--primary)';
            };
        }
        
        // 2. Update Info Panel
        const infoPanel = document.querySelector('.product-info-panel');
        if (infoPanel) {
            const titleEl = document.createElement('h1');
            titleEl.className = 'product-name-dynamic';
            titleEl.textContent = p.productName || p.name;
            titleEl.style.fontSize = '2.5rem';
            titleEl.style.fontWeight = '800';
            titleEl.style.marginBottom = '0.5rem';
            
            const ratingHtml = `
                <div class="rating-dynamic" style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.5rem;">
                    <div style="color: #ffb800; font-size: 1rem;">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star-half-alt"></i>
                    </div>
                    <span style="color: var(--text-muted); font-size: 0.9rem; font-weight: 500;">(4.9 • ${p.reviewCount || 0} reviews)</span>
                </div>
            `;
            
            const priceHtml = `
                <div class="price-container-dynamic" style="margin-bottom: 2rem;">
                    <span class="product-price-dynamic" style="font-size: 2.2rem; font-weight: 800; color: var(--text-main);">$${parseFloat(p.productPrice || p.price || 0).toFixed(2)}</span>
                    ${p.oldPrice ? `<span style="text-decoration: line-through; color: var(--text-muted); margin-left: 1rem; font-size: 1.2rem;">$${parseFloat(p.oldPrice).toFixed(2)}</span>` : ''}
                </div>
            `;

            const descHtml = `<p class="product-desc-dynamic" style="margin-bottom: 2.5rem; color: var(--text-muted); line-height: 1.8; font-size: 1.1rem; max-width: 90%;">${p.productDescription || p.description || 'Experience premium quality craftsmanship and modern design with this exclusive Chenari selection.'}</p>`;

            // Colors
            let colorsHtml = '';
            const colorList = p.colors || [];
            if (colorList.length > 0) {
                colorsHtml = `
                    <div class="selector-section" style="margin-bottom: 2rem;">
                        <span class="selector-label" style="display: block; font-weight: 700; margin-bottom: 1rem; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1.5px;">Color: <span id="selected-color-name" style="color: var(--text-muted); font-weight: 500;">${colorList[0]}</span></span>
                        <div class="options-grid" style="display: flex; gap: 1rem;">
                            ${colorList.map((c, i) => `
                                <div class="color-swatch-premium ${i === 0 ? 'active' : ''}" 
                                     style="width: 42px; height: 42px; border-radius: 50%; cursor: pointer; border: 3px solid ${i === 0 ? 'var(--primary)' : '#eee'}; background: ${c.toLowerCase() === 'white' ? '#fff' : c}; box-shadow: var(--shadow-sm); transition: all 0.3s ease;" 
                                     data-color="${c}" onclick="selectColor(this, '${c}')"></div>
                            `).join('')}
                        </div>
                    </div>
                `;
                window.selectColor = (el, color) => {
                    document.querySelectorAll('.color-swatch-premium').forEach(s => s.style.borderColor = '#eee');
                    el.style.borderColor = 'var(--primary)';
                    document.getElementById('selected-color-name').innerText = color;
                    window.showToast(`Selected color: ${color}`, 'info');
                };
            }

            // Variants / Packages
            let variantHtml = '';
            const variants = p.variants || ['Standard Edition', 'Premium Pack'];
            variantHtml = `
                <div class="selector-section" style="margin-bottom: 2rem;">
                    <span class="selector-label" style="display: block; font-weight: 700; margin-bottom: 1rem; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1.5px;">Select Package</span>
                    <div class="options-grid" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        ${variants.map((v, i) => `
                            <div class="variant-chip-premium ${i === 0 ? 'active' : ''}" 
                                 style="padding: 1rem 1.5rem; border: 2px solid ${i === 0 ? 'var(--primary)' : '#eee'}; border-radius: var(--radius-md); cursor: pointer; background: ${i === 0 ? 'rgba(0, 82, 204, 0.05)' : 'transparent'}; transition: all 0.3s ease;" 
                                 onclick="selectVariant(this, '${v}')">
                                <span style="font-weight: 600; color: ${i === 0 ? 'var(--primary)' : 'var(--text-main)'};">${v}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            window.selectVariant = (el, variant) => {
                document.querySelectorAll('.variant-chip-premium').forEach(v => {
                    v.style.borderColor = '#eee';
                    v.style.background = 'transparent';
                    v.querySelector('span').style.color = 'var(--text-main)';
                });
                el.style.borderColor = 'var(--primary)';
                el.style.background = 'rgba(0, 82, 204, 0.05)';
                el.querySelector('span').style.color = 'var(--primary)';
                window.showToast(`Switched to ${variant}`, 'info');
            };

            // Sizes (Future Ready)
            let sizesHtml = '';
            if (p.sizes && p.sizes.length > 0) {
                sizesHtml = `
                    <div class="selector-section" style="margin-bottom: 2.5rem;">
                        <span class="selector-label" style="display: block; font-weight: 700; margin-bottom: 1rem; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1.5px;">Size</span>
                        <div class="options-grid" style="display: flex; gap: 0.8rem; flex-wrap: wrap;">
                            ${p.sizes.map(s => `
                                <div class="size-chip" style="width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border: 2px solid #eee; border-radius: var(--radius-md); cursor: pointer; font-weight: 600; transition: all 0.3s ease;" onclick="this.parentNode.querySelectorAll('.size-chip').forEach(c => {c.style.borderColor='#eee'; c.style.background='transparent'; c.style.color='inherit'}); this.style.borderColor='var(--primary)'; this.style.background='var(--primary)'; this.style.color='#fff';">${s}</div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            const qtyHtml = `
                <div class="selector-section" style="margin-bottom: 2.5rem; display: flex; align-items: center; gap: 2rem;">
                    <div>
                        <span class="selector-label" style="display: block; font-weight: 700; margin-bottom: 0.8rem; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1.5px;">Quantity</span>
                        <div class="qty-stepper" style="display: flex; align-items: center; border: 2px solid #eee; border-radius: var(--radius-md); overflow: hidden; width: 140px;">
                            <button onclick="updateQtyDetail(-1)" style="flex: 1; padding: 0.8rem; background: #fff; border: none; cursor: pointer; font-size: 1.2rem; font-weight: 700;">-</button>
                            <input type="number" id="product-qty-val" value="1" min="1" max="10" readonly style="width: 40px; text-align: center; border: none; font-weight: 700; font-family: inherit; font-size: 1.1rem;">
                            <button onclick="updateQtyDetail(1)" style="flex: 1; padding: 0.8rem; background: #fff; border: none; cursor: pointer; font-size: 1.2rem; font-weight: 700;">+</button>
                        </div>
                    </div>
                </div>
            `;
            window.updateQtyDetail = (delta) => {
                const input = document.getElementById('product-qty-val');
                let val = parseInt(input.value) + delta;
                if (val >= 1 && val <= 10) input.value = val;
            };

            const buttonsHtml = `
                <div class="action-buttons-premium" style="display: grid; grid-template-columns: 2fr 1fr 60px; gap: 1rem; margin-bottom: 3rem;">
                    <button class="btn btn-primary btn-large" id="detail-add-cart" style="padding: 1.2rem; font-size: 1.1rem; font-weight: 700; letter-spacing: 0.5px;">
                        <i class="fas fa-shopping-bag" style="margin-right: 0.5rem;"></i> Add to Cart
                    </button>
                    <button class="btn btn-outline btn-large" id="detail-buy-now" style="padding: 1.2rem; font-size: 1.1rem; font-weight: 700;">Buy Now</button>
                    <button class="btn wishlist-btn-premium" onclick="handleAddToWishlist('${p.id}')" style="background: #f4f5f7; border-radius: var(--radius-md); padding: 1rem; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease;">
                        <i class="far fa-heart" style="font-size: 1.5rem;"></i>
                    </button>
                </div>
            `;

            const deliveryHtml = `
                <div class="delivery-card-premium" style="padding: 2rem; background: #fafbfc; border-radius: var(--radius-lg); border: 1px solid #f0f2f5;">
                    <div style="display: flex; gap: 1.5rem; margin-bottom: 2rem;">
                        <div style="width: 48px; height: 48px; background: rgba(0, 82, 204, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-truck" style="color: var(--primary); font-size: 1.2rem;"></i>
                        </div>
                        <div>
                            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 0.4rem;">Express Shipping</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;">Free delivery on orders over $500. Estimated 2-4 business days.</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1.5rem;">
                        <div style="width: 48px; height: 48px; background: rgba(69, 179, 69, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-undo-alt" style="color: var(--chenari-green); font-size: 1.2rem;"></i>
                        </div>
                        <div>
                            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 0.4rem;">Flexible Returns</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;">Shop with confidence. 30-day no-questions-asked return policy.</div>
                        </div>
                    </div>
                </div>
            `;

            infoPanel.innerHTML = '';
            infoPanel.appendChild(titleEl);
            infoPanel.insertAdjacentHTML('beforeend', ratingHtml + priceHtml + descHtml + colorsHtml + variantHtml + sizesHtml + qtyHtml + buttonsHtml + deliveryHtml);

            // Re-bind events for the new HTML
            document.getElementById('detail-add-cart').addEventListener('click', () => {
                const qty = parseInt(document.getElementById('product-qty-val').value);
                const cartItem = { ...p, qty };
                window.handleAddToCart(cartItem, qty);
            });
            document.getElementById('detail-buy-now').addEventListener('click', () => {
                const cartItem = { ...p, qty: 1 };
                window.handleBuyNow(cartItem);
            });
        }

            // Buy Now Bind
            const buyNowBtn = document.getElementById('detail-buy-now');
            buyNowBtn.addEventListener('click', () => {
                const cartItem = {
                    ...p,
                    selectedColor,
                    selectedVariant
                };
                window.handleBuyNow(cartItem);
            });
        }

        // 3. Fetch Related Products
        const q = query(collection(db, "products"), where("category", "==", p.category));
        const relSnapshot = await getDocs(q);
        let relatedProducts = [];
        relSnapshot.forEach(doc => {
            if (doc.id !== p.id) {
                relatedProducts.push({ id: doc.id, ...doc.data() });
            }
        });
        
        const relContainer = document.getElementById('related-products');
        if (relContainer) {
            if (relatedProducts.length > 0) {
                renderProducts(relContainer, relatedProducts.slice(0, 4));
            } else {
                relContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem 0;">No similar products found.</p>';
            }
        }

    } catch (error) {
        console.error("Error loading product details:", error);
    }
}

function initSkeletons() {
    const grids = document.querySelectorAll('.product-grid');
    grids.forEach(grid => {
        grid.innerHTML = '';
        const count = grid.hasAttribute('data-count') ? parseInt(grid.getAttribute('data-count')) : 8;
        for (let i = 0; i < count; i++) {
            const card = document.createElement('a');
            card.href = "product-details.html";
            card.className = 'skeleton-card';
            card.style.textDecoration = 'none';
            card.style.display = 'block';
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

    // Global protection for Profile and Cart links (Original Restoration)
    document.querySelectorAll('.nav-item').forEach(item => {
        const text = item.innerText.toLowerCase();
        if (text.includes('profile') || text.includes('cart')) {
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            
            newItem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // CRITICAL: prevent page transition loader from firing
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
 * Cart Rendering (Page-specific)
 */
async function renderCart() {
    const list = document.getElementById('cart-items-list');
    if (!list) return;

    if (!cartState || cartState.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 4rem 2rem; background: #fafbfc; border-radius: var(--radius-lg); border: 1px dashed #ddd;">
                <div style="font-size: 4rem; color: #ddd; margin-bottom: 1.5rem;"><i class="fas fa-shopping-bag"></i></div>
                <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">Your bag is empty</h3>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Looks like you haven't added anything to your bag yet.</p>
                <a href="index.html" class="btn btn-primary" style="padding: 1rem 2rem;">Start Shopping</a>
            </div>
        `;
        updateSummary(0, 0);
        return;
    }

    list.innerHTML = '';
    let subtotal = 0;
    let itemCount = 0;

    cartState.forEach((item, index) => {
        const itemTotal = parseFloat(item.productPrice || item.price || 0) * (item.qty || 1);
        subtotal += itemTotal;
        itemCount += (item.qty || 1);

        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item-card';
        itemEl.style.cssText = `
            display: grid;
            grid-template-columns: 120px 1fr 140px 100px;
            align-items: center;
            gap: 2rem;
            padding: 1.5rem;
            background: var(--white);
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            margin-bottom: 1.5rem;
            transition: all 0.3s ease;
        `;

        itemEl.innerHTML = `
            <img src="${item.productImage || item.imageUrl || ''}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-sm);">
            <div>
                <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.3rem;">${item.productName || item.name}</h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${item.category || 'Premium Selection'}</p>
                <div style="display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.85rem;">
                    ${item.selectedColor ? `<span style="background: #f4f5f7; padding: 0.2rem 0.6rem; border-radius: 4px;">Color: ${item.selectedColor}</span>` : ''}
                    ${item.selectedVariant ? `<span style="background: #f4f5f7; padding: 0.2rem 0.6rem; border-radius: 4px;">Variant: ${item.selectedVariant}</span>` : ''}
                </div>
            </div>
            <div style="display: flex; align-items: center; border: 1.5px solid #eee; border-radius: 8px; overflow: hidden; width: fit-content; margin: 0 auto;">
                <button onclick="updateCartQty(${index}, -1)" style="padding: 0.5rem 0.8rem; background: #fff; border: none; cursor: pointer; font-weight: 700;">-</button>
                <span style="padding: 0 0.5rem; font-weight: 700; min-width: 30px; text-align: center;">${item.qty}</span>
                <button onclick="updateCartQty(${index}, 1)" style="padding: 0.5rem 0.8rem; background: #fff; border: none; cursor: pointer; font-weight: 700;">+</button>
            </div>
            <div style="text-align: right;">
                <div style="font-weight: 800; font-size: 1.15rem; margin-bottom: 0.5rem;">$${itemTotal.toFixed(2)}</div>
                <button onclick="removeFromCart(${index})" style="color: #ff4d4d; border: none; background: none; cursor: pointer; font-size: 0.85rem; font-weight: 600;">Remove</button>
            </div>
        `;
        list.appendChild(itemEl);
    });

    updateSummary(subtotal, itemCount);
}

function updateSummary(subtotal, count) {
    const subEl = document.getElementById('summary-subtotal');
    const totEl = document.getElementById('summary-total');
    const countEl = document.getElementById('summary-count');

    if (subEl) subEl.textContent = `$${subtotal.toFixed(2)}`;
    if (totEl) totEl.textContent = `$${subtotal.toFixed(2)}`;
    if (countEl) countEl.textContent = `(${count} item${count !== 1 ? 's' : ''})`;
}

window.updateCartQty = async (index, delta) => {
    if (!cartState[index]) return;
    let newQty = cartState[index].qty + delta;
    if (newQty < 1) return;
    if (newQty > 10) {
        window.showToast('Max limit reached', 'warning');
        return;
    }
    cartState[index].qty = newQty;
    await updateFirestoreCart();
    renderCart();
};

window.removeFromCart = async (index) => {
    cartState.splice(index, 1);
    await updateFirestoreCart();
    renderCart();
    window.showToast('Item removed from bag', 'info');
};

window.clearCart = async () => {
    if (confirm('Clear all items from your bag?')) {
        cartState = [];
        await updateFirestoreCart();
        renderCart();
        window.showToast('Bag cleared', 'info');
    }
};

window.handleCheckout = () => {
    if (cartState.length === 0) return;
    window.showToast('Redirecting to secure checkout...', 'success');
    setTimeout(() => {
        window.location.href = 'checkout.html';
    }, 1500);
};

// Auto-run if on cart page
if (window.location.pathname.includes('cart.html')) {
    // Wait for auth before rendering
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            // Give a tiny delay to ensure cartState is synced from firestore (handleLoginSync)
            setTimeout(renderCart, 500);
        }
    });
}

/**
 * User Profile Logic
 */
function injectAuthModal() {
    if (document.getElementById('authModal')) return;
    const modalHTML = `
        <div class="modal-overlay" id="authModal">
            <div class="modal-content auth-modal">
                <i class="fas fa-times modal-close" id="close-auth"></i>
                <div class="auth-header">
                    <h2 id="auth-title">Welcome to Chenari</h2>
                    <p id="auth-subtitle">Please login to continue your premium shopping experience</p>
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
        <div class="logout-overlay" id="logoutModal">
            <div class="modal-content logout-modal">
                <div class="logout-icon">
                    <i class="fas fa-sign-out-alt"></i>
                </div>
                <div class="auth-header">
                    <h2>Logout Confirmation</h2>
                    <p>Are you sure you want to logout?</p>
                </div>
                <div class="logout-actions">
                    <button class="btn btn-outline" id="cancel-logout">Cancel</button>
                    <button class="btn btn-primary" id="confirm-logout">Logout</button>
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
        document.body.classList.add('modal-open');
    }
}

function hideLogoutModal() {
    const modal = document.getElementById('logoutModal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    // Reset the confirm button state
    const confirmBtn = document.getElementById('confirm-logout');
    if (confirmBtn) {
        confirmBtn.innerHTML = 'Logout';
        confirmBtn.disabled = false;
    }
}

/**
 * Force-cleanup all overlay/modal states.
 * Called on every auth state change to catch stuck overlays.
 */
function cleanupAllOverlays() {
    document.body.classList.remove('modal-open');
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.style.display = 'none';
    const logoutModal = document.getElementById('logoutModal');
    if (logoutModal) logoutModal.style.display = 'none';
    const clearCartModal = document.getElementById('clearCartModal');
    if (clearCartModal) clearCartModal.style.display = 'none';
    // Also hide page transition loader if it got stuck
    const pageLoader = document.getElementById('mm-page-loader');
    if (pageLoader) pageLoader.classList.remove('active');
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
    if (!modal) return; // Safety: modal not injected yet
    
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const nameFields = document.getElementById('name-fields');
    const confirmPassField = document.getElementById('confirm-pass-field');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchText = document.getElementById('switch-text');
    const switchLink = document.getElementById('switch-auth-mode');
    const errorMsg = document.getElementById('auth-error');

    if (errorMsg) errorMsg.innerText = '';
    if (isSignUpMode) {
        if (title) title.innerText = 'Create Chenari Account';
        if (subtitle) subtitle.innerText = 'Join Chenari.com today for exclusive drops';
        if (nameFields) nameFields.style.display = 'block';
        if (confirmPassField) confirmPassField.style.display = 'block';
        if (submitBtn) submitBtn.innerText = 'Sign Up';
        if (switchText) switchText.innerText = 'Already have an account?';
        if (switchLink) switchLink.innerText = 'Login';
    } else {
        if (title) title.innerText = 'Welcome Back';
        if (subtitle) subtitle.innerText = 'Please login to continue your premium shopping experience';
        if (nameFields) nameFields.style.display = 'none';
        if (confirmPassField) confirmPassField.style.display = 'none';
        if (submitBtn) submitBtn.innerText = 'Login';
        if (switchText) switchText.innerText = 'Don\'t have an account?';
        if (switchLink) switchLink.innerText = 'Sign Up';
    }
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
}

window.loginUser = () => window.showAuthModal(false);
window.signupUser = () => window.showAuthModal(true);


function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    // Reset form error on close
    const errorMsg = document.getElementById('auth-error');
    if (errorMsg) errorMsg.innerText = '';
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
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Fetch user role from Firestore to determine redirect
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                window.location.href = 'admin/index.html';
                return; // Stop further execution
            }
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
            fullName: user.displayName || 'MyMart User',
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
        localStorage.removeItem('sh_cart');
    } catch (error) {
        console.error('Logout error:', error);
        window.showToast("Error logging out. Please try again.", "error");
    } finally {
        // ALWAYS clean up overlays regardless of success/failure
        hideLogoutModal();
        cleanupAllOverlays();
        window.location.href = 'index.html';
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
    if (!currentUser) {
        if (window.showAuthModal) window.showAuthModal();
        return;
    }
    window.location.href = 'cart.html';
};

window.handleAddToCart = async (product, qty = 1) => {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    // Check if item with same id, color, and variant already exists
    const existing = cartState.find(p => p.id === product.id && p.selectedColor === product.selectedColor && p.selectedVariant === product.selectedVariant);
    
    if (existing) {
        existing.qty += qty;
    } else {
        cartState.push({ ...product, qty: qty });
    }
    
    await updateFirestoreCart();
    
    window.showToast('Product added to cart!', 'success');
};

window.handleBuyNow = async (product) => {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    // Add to cart and redirect
    const existing = cartState.find(p => p.id === product.id && p.selectedColor === product.selectedColor && p.selectedVariant === product.selectedVariant);
    if (!existing) {
        cartState.push({ ...product, qty: 1 });
    }
    await updateFirestoreCart();
    window.location.href = 'cart.html';
};

/**
 * Navigation Actions
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
            name: product.name || product.productName || 'Product',
            price: product.price || product.productPrice || 0,
            image: product.imageUrl || product.productImage || '',
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
        const itemPrice = item.price || item.productPrice || 0;
        const itemName = item.name || item.productName || 'Product';
        const itemImage = item.imageUrl || item.productImage || '';
        const itemCategory = item.category || '';
        subtotal += itemPrice * item.qty;
        return `
            <div class="cart-item">
                <img src="${itemImage}" alt="${itemName}" class="cart-item-img">
                <div class="cart-item-details">
                    <h3>${itemName}</h3>
                    <p class="cart-item-category">${itemCategory}</p>
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
                <div class="cart-item-price">$${(itemPrice * item.qty).toFixed(2)}</div>
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

function injectClearCartModal() {
    if (document.getElementById('clearCartModal')) return;
    const modalHTML = `
        <div class="modal-overlay" id="clearCartModal">
            <div class="modal-content logout-modal" id="clearCartModalContent">
                <!-- Content dynamically injected here -->
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Close when clicking outside
    document.getElementById('clearCartModal').addEventListener('click', (e) => {
        if (e.target.id === 'clearCartModal') {
            document.getElementById('clearCartModal').style.display = 'none';
            document.body.style.overflow = '';
        }
    });
}

window.clearCart = () => {
    injectClearCartModal();
    const modal = document.getElementById('clearCartModal');
    const content = document.getElementById('clearCartModalContent');
    
    if (!cartState || cartState.length === 0) {
        // Empty Cart Popup
        content.innerHTML = `
            <div class="logout-icon" style="background: rgba(0, 82, 204, 0.1); color: var(--primary); animation: none; box-shadow: none;">
                <i class="fas fa-shopping-cart"></i>
            </div>
            <div class="auth-header">
                <h2>Cart Empty</h2>
                <p>Your cart is already empty.</p>
            </div>
            <div style="margin-top: 2rem;">
                <button class="btn btn-primary" style="width: 100%; padding: 0.8rem; font-size: 1rem;" onclick="document.getElementById('clearCartModal').style.display='none'; document.body.style.overflow=''">OK</button>
            </div>
        `;
    } else {
        // Confirmation Popup
        content.innerHTML = `
            <div class="logout-icon" style="background: rgba(255, 77, 79, 0.1); color: #ff4d4f;">
                <i class="fas fa-trash-alt"></i>
            </div>
            <div class="auth-header">
                <h2>Clear Cart</h2>
                <p>Are you sure you want to clear your cart? This action cannot be undone.</p>
            </div>
            <div class="logout-actions">
                <button class="btn btn-outline" onclick="document.getElementById('clearCartModal').style.display='none'; document.body.style.overflow=''">Cancel</button>
                <button class="btn btn-primary" id="confirm-clear-cart" style="background: #ff4d4f; border-color: #ff4d4f;">Clear Cart</button>
            </div>
        `;

        document.getElementById('confirm-clear-cart').addEventListener('click', async () => {
            const confirmBtn = document.getElementById('confirm-clear-cart');
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clearing...';
            confirmBtn.disabled = true;
            
            cartState = [];
            await updateFirestoreCart();
            
            document.getElementById('clearCartModal').style.display = 'none';
            document.body.style.overflow = '';
            
            if (window.showToast) {
                window.showToast('Cart cleared successfully.');
            }
        });
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
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
    if (searchBar) {
        searchBar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchBar.value.trim();
                if (query) {
                    window.showToast(`Searching for "${query}"...`, 'info');
                    // Future: window.location.href = `search.html?q=${encodeURIComponent(query)}`;
                }
            }
        });
        
        // Mobile Search Toggle
        const searchIcon = document.querySelector('.search-icon');
        if (searchIcon) {
            searchIcon.addEventListener('click', () => {
                searchBar.focus();
                const query = searchBar.value.trim();
                if (query) window.showToast(`Searching for "${query}"...`, 'info');
            });
        }
    }
}

function setupNewsletter() {
    const form = document.querySelector('.newsletter-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = form.querySelector('input').value;
            window.showToast(`Welcome to the Chenari Circle, ${email}!`, 'success');
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
