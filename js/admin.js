/**
 * MyMart Admin Core Logic - Production Version
 * Handles Dashboard stats, Product CRUD, Order management, User roles, and Activity logs.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, 
    query, where, getDocs, onSnapshot, orderBy, limit, addDoc, Timestamp 
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

// Reuse existing Firebase app
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Cloudinary Configuration
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dxpmh3rf6/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "E-commerce"; 

let currentAdmin = null;

// ─── Initialization ───────────────────────────────────────────────────────────
document.addEventListener('admin-verified', (e) => {
    currentAdmin = e.detail.user;
    const adminNameEl = document.getElementById('admin-name');
    if (adminNameEl) adminNameEl.innerText = currentAdmin.fullName || 'Admin';
    initDashboard();
});

function initDashboard() {
    const path = window.location.pathname;
    const isOverview = path.includes('index.html') || path.endsWith('/admin') || path.endsWith('/admin/');
    
    if (isOverview) loadOverview();
    if (window.location.href.includes('add-product.html')) setupAddProduct();
    if (window.location.href.includes('products.html')) loadManageProducts();
    if (window.location.href.includes('orders.html')) loadOrders();
    if (window.location.href.includes('users.html')) loadUsers();
    if (window.location.href.includes('history.html')) loadHistory();
    
    injectToastContainer();
}

// ─── Toast System ─────────────────────────────────────────────────────────────
function injectToastContainer() {
    if (document.getElementById('toast-container')) return;
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
}

window.showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${icons[type]}"></i></div>
        <div class="toast-content"><p>${message}</p></div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    }, 5000);
    toast.querySelector('.toast-close').onclick = () => toast.remove();
}

// ─── Overview Logic ───────────────────────────────────────────────────────────
async function loadOverview() {
    // Real-time Stats
    onSnapshot(collection(db, "products"), (snap) => {
        document.getElementById('stat-products').innerText = snap.size;
    });
    onSnapshot(collection(db, "users"), (snap) => {
        document.getElementById('stat-users').innerText = snap.size;
    });
    onSnapshot(collection(db, "orders"), (snap) => {
        document.getElementById('stat-orders').innerText = snap.size;
        let revenue = 0;
        snap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'delivered') revenue += data.total || 0;
        });
        document.getElementById('stat-sales').innerText = `$${revenue.toFixed(2)}`;
    });

    // Latest Orders
    onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(5)), (snap) => {
        const tbody = document.querySelector('#latest-orders-table tbody');
        if (!tbody) return;
        const empty = document.getElementById('orders-empty');
        if (snap.empty) { empty.style.display = 'block'; tbody.innerHTML = ''; return; }
        empty.style.display = 'none';
        tbody.innerHTML = snap.docs.map(doc => {
            const order = doc.data();
            return `<tr>
                <td>#${doc.id.substring(0, 8)}</td>
                <td>${order.userName || 'Guest'}</td>
                <td>$${(order.total || 0).toFixed(2)}</td>
                <td><span class="status-pill status-${order.status || 'processing'}">${order.status || 'Processing'}</span></td>
            </tr>`;
        }).join('');
    });

    // Recent Activity
    onSnapshot(query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(6)), (snap) => {
        const logContainer = document.getElementById('activity-log');
        if (!logContainer) return;
        const empty = document.getElementById('logs-empty');
        if (snap.empty) { empty.style.display = 'block'; logContainer.innerHTML = ''; return; }
        empty.style.display = 'none';
        logContainer.innerHTML = snap.docs.map(doc => {
            const log = doc.data();
            const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString() : 'Just now';
            return `<div style="display: flex; gap: 1rem; align-items: flex-start;">
                <div style="width: 32px; height: 32px; background: #f0f7ff; color: #0052cc; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i class="fas fa-history" style="font-size: 0.8rem;"></i>
                </div>
                <div>
                    <p style="font-size: 0.9rem; margin: 0; color: #333;"><strong>${log.adminName}</strong> ${log.action} <strong>${log.entity}</strong></p>
                    <span style="font-size: 0.75rem; color: #888;">${time}</span>
                </div>
            </div>`;
        }).join('');
    });
}

function setupAddProduct() {
    const dropzone = document.getElementById('image-dropzone');
    const fileInput = document.getElementById('productImage');
    const form = document.getElementById('product-form');
    let selectedFile = null;

    if (!dropzone || !fileInput || !form) return;

    const handleFileSelect = (file) => {
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            window.showToast("Invalid format. Please select JPG, PNG, or WEBP.", "error");
            return;
        }

        selectedFile = file;

        // Show Preview inside Dropzone
        const reader = new FileReader();
        reader.onload = (re) => {
            dropzone.innerHTML = `
                <img src="${re.target.result}" style="max-width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px;">
                <p style="margin-top: 10px; font-size: 0.8rem; color: var(--admin-primary);">Image Selected - Click to change</p>
                <input type="file" id="productImage" accept="image/*" style="display: none;">
            `;
        };
        reader.readAsDataURL(file);
    };

    // Use delegation so it works even after innerHTML replacement
    dropzone.addEventListener('change', (e) => {
        if (e.target.id === 'productImage') {
            handleFileSelect(e.target.files[0]);
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedFile) return window.showToast("Please select an image.", "error");

        const btn = document.getElementById('save-product-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            // 1. Upload to Cloudinary
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('folder', 'E-commerce/products');

            const cloudRes = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
            const cloudData = await cloudRes.json();
            
            if (!cloudData.secure_url) throw new Error("Upload failed");
            
            const imageUrl = cloudData.secure_url;

            // 2. Add to Firestore
            const product = {
                name: document.getElementById('productName').value,
                price: parseFloat(document.getElementById('productPrice').value),
                category: document.getElementById('category').value,
                stock: parseInt(document.getElementById('stock').value),
                description: document.getElementById('productDescription').value,
                colors: document.getElementById('productColors').value.split(',').map(c => c.trim()),
                imageUrl: imageUrl, 
                createdAt: Timestamp.now()
            };

            await addDoc(collection(db, "products"), product);
            await logAction('added product', product.name);
            window.showToast("Product saved successfully!");
            
            // Reset Form and Preview
            form.reset();
            selectedFile = null;
            dropzone.innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Click or drag image to upload to Cloudinary</p>
                <input type="file" id="productImage" accept="image/*" style="display: none;">
            `;
        } catch (error) {
            console.error(error);
            window.showToast("Failed to save product.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save Product';
        }
    });
}

// ─── Manage Products Logic ────────────────────────────────────────────────────
async function loadManageProducts() {
    const table = document.querySelector('#products-table tbody');
    const search = document.getElementById('product-search');
    const filter = document.getElementById('category-filter');
    let allProducts = [];

    const render = (items) => {
        if (items.length === 0) {
            document.getElementById('products-empty').style.display = 'block';
            table.innerHTML = '';
            return;
        }
        document.getElementById('products-empty').style.display = 'none';
        table.innerHTML = items.map(p => `
            <tr>
                <td><img src="${p.imageUrl || p.productImage}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;"></td>
                <td><strong>${p.name || p.productName}</strong></td>
                <td><span class="badge" style="background:#f0f0f0; padding:4px 8px; border-radius:4px;">${p.category}</span></td>
                <td>$${(p.price || p.productPrice || 0).toFixed(2)}</td>
                <td>${p.stock}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-outline btn-sm" style="color: #ff5630;" onclick="deleteProduct('${p.id}', '${(p.name || p.productName || 'product').replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    };

    onSnapshot(collection(db, "products"), (snap) => {
        allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilters();
    });

    const applyFilters = () => {
        let filtered = allProducts;
        if (filter.value !== 'all') filtered = filtered.filter(p => p.category === filter.value);
        if (search.value) {
            const s = search.value.toLowerCase();
            filtered = filtered.filter(p => p.productName.toLowerCase().includes(s) || p.category.toLowerCase().includes(s));
        }
        render(filtered);
    };

    search.addEventListener('input', applyFilters);
    filter.addEventListener('change', applyFilters);
}

// ─── Manage Users Logic ───────────────────────────────────────────────────────
async function loadUsers() {
    const table = document.querySelector('#users-table tbody');
    onSnapshot(collection(db, "users"), (snap) => {
        if (snap.empty) { document.getElementById('users-empty').style.display = 'block'; table.innerHTML = ''; return; }
        document.getElementById('users-empty').style.display = 'none';
        table.innerHTML = snap.docs.map(doc => {
            const u = doc.data();
            const joined = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'N/A';
            const lastLogin = u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : 'N/A';
            return `<tr>
                <td><strong>${u.fullName || 'Unnamed User'}</strong></td>
                <td>${u.email}</td>
                <td><span class="badge" style="background:${u.role === 'admin' ? '#e6f4ff' : '#f0f0f0'}; color:${u.role === 'admin' ? '#0052cc' : '#333'}">${u.role}</span></td>
                <td>${joined}</td>
                <td>${lastLogin}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="openUserRoleModal('${doc.id}', '${u.fullName}', '${u.role}')"><i class="fas fa-user-cog"></i> Role</button>
                </td>
            </tr>`;
        }).join('');
    });
}

// ─── Orders Management ────────────────────────────────────────────────────────
async function loadOrders() {
    const table = document.querySelector('#orders-full-table tbody');
    onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
        if (snap.empty) { document.getElementById('orders-full-empty').style.display = 'block'; table.innerHTML = ''; return; }
        document.getElementById('orders-full-empty').style.display = 'none';
        table.innerHTML = snap.docs.map(doc => {
            const o = doc.data();
            const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : 'N/A';
            return `<tr>
                <td>#${doc.id.substring(0, 8)}</td>
                <td><strong>${o.userName || 'Guest'}</strong><br><span style="font-size:0.7rem; color:#888;">${o.userEmail}</span></td>
                <td>${o.items?.length || 0} items</td>
                <td><strong>$${(o.total || 0).toFixed(2)}</strong></td>
                <td>${date}</td>
                <td><span class="status-pill status-${o.status || 'processing'}">${o.status || 'Processing'}</span></td>
                <td><button class="btn btn-outline btn-sm" onclick="viewOrder('${doc.id}')">Manage</button></td>
            </tr>`;
        }).join('');
    });
}

// ─── History Logic ────────────────────────────────────────────────────────────
async function loadHistory() {
    const table = document.querySelector('#history-table tbody');
    onSnapshot(query(collection(db, "adminLogs"), orderBy("timestamp", "desc")), (snap) => {
        if (snap.empty) { document.getElementById('history-empty').style.display = 'block'; table.innerHTML = ''; return; }
        document.getElementById('history-empty').style.display = 'none';
        table.innerHTML = snap.docs.map(doc => {
            const l = doc.data();
            const date = l.timestamp?.toDate ? l.timestamp.toDate().toLocaleString() : 'N/A';
            return `<tr>
                <td>${date}</td>
                <td><strong>${l.adminName}</strong></td>
                <td>${l.action}</td>
                <td>${l.entity}</td>
                <td><span class="status-pill status-delivered">Success</span></td>
            </tr>`;
        }).join('');
    });
}

// ─── Actions & Utils ──────────────────────────────────────────────────────────
async function logAction(action, entity) {
    if (!currentAdmin) return;
    await addDoc(collection(db, "adminLogs"), {
        adminId: currentAdmin.uid,
        adminName: currentAdmin.fullName,
        action,
        entity,
        timestamp: Timestamp.now()
    });
}

// Global functions for HTML onclicks
window.editProduct = async (id) => {
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) return;
    const p = snap.data();
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = p.productName;
    document.getElementById('edit-price').value = p.productPrice;
    document.getElementById('edit-stock').value = p.stock;
    document.getElementById('editProductModal').style.display = 'flex';
};

window.deleteProduct = async (id, name) => {
    if (confirm(`Delete product "${name}"?`)) {
        await deleteDoc(doc(db, "products", id));
        await logAction('deleted product', name);
        window.showToast("Product deleted.");
    }
};

window.openUserRoleModal = (id, name, role) => {
    document.getElementById('userDetailModal').setAttribute('data-id', id);
    document.getElementById('user-info-brief').innerHTML = `<strong>User:</strong> ${name}`;
    document.getElementById('update-user-role').value = role;
    document.getElementById('userDetailModal').style.display = 'flex';
};

window.viewOrder = async (id) => {
    const snap = await getDoc(doc(db, "orders", id));
    if (!snap.exists()) return;
    const o = snap.data();
    document.getElementById('order-detail-content').innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
            <div><p><strong>Customer:</strong> ${o.userName}</p><p><strong>Email:</strong> ${o.userEmail}</p></div>
            <div><p><strong>Order ID:</strong> #${id}</p><p><strong>Total:</strong> $${(o.total || 0).toFixed(2)}</p></div>
        </div>
        <h4>Items:</h4>
        <div style="background:#f9f9f9; padding:1rem; border-radius:8px;">
            ${o.items.map(i => `<p style="margin:4px 0;">${i.name} x ${i.qty} — $${(i.price * i.qty).toFixed(2)}</p>`).join('')}
        </div>
    `;
    document.getElementById('update-order-status').value = o.status || 'processing';
    document.getElementById('orderDetailModal').setAttribute('data-id', id);
    document.getElementById('orderDetailModal').style.display = 'flex';
};

// Modal Controls
document.addEventListener('DOMContentLoaded', () => {
    // Close buttons
    ['editProductModal', 'userDetailModal', 'orderDetailModal'].forEach(id => {
        const modal = document.getElementById(id);
        if (!modal) return;
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
        const cancelBtn = modal.querySelector('.btn-outline');
        if (cancelBtn) cancelBtn.onclick = () => modal.style.display = 'none';
    });

    // Save User Role
    const saveRoleBtn = document.getElementById('save-user-role');
    if (saveRoleBtn) saveRoleBtn.onclick = async () => {
        const id = document.getElementById('userDetailModal').getAttribute('data-id');
        const role = document.getElementById('update-user-role').value;
        await updateDoc(doc(db, "users", id), { role });
        await logAction('updated user role', '#' + id.substring(0, 6));
        document.getElementById('userDetailModal').style.display = 'none';
        window.showToast("User role updated.");
    };

    // Save Order Status
    const saveOrderBtn = document.getElementById('save-order-status');
    if (saveOrderBtn) saveOrderBtn.onclick = async () => {
        const id = document.getElementById('orderDetailModal').getAttribute('data-id');
        const status = document.getElementById('update-order-status').value;
        await updateDoc(doc(db, "orders", id), { status });
        await logAction('updated order status', '#' + id.substring(0, 8));
        document.getElementById('orderDetailModal').style.display = 'none';
        window.showToast("Order status updated.");
    };
});
