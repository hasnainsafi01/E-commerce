/**
 * MyMart Admin - Production Stable Architecture
 * Handles Dashboard, Products, Orders, Users, and Audit Logs.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, updateDoc, deleteDoc, collection, 
    query, where, onSnapshot, orderBy, limit, addDoc, Timestamp 
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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Cloudinary Configuration
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqsvcn94y/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "E-commerce";

let currentAdmin = null;

// ─── App Initialization ──────────────────────────────────────────────────────
document.addEventListener('admin-verified', (e) => {
    currentAdmin = e.detail.user;
    const adminNameEl = document.getElementById('admin-name');
    if (adminNameEl) adminNameEl.innerText = currentAdmin.fullName || 'Administrator';
    initAdminPanel();
});

function initAdminPanel() {
    const path = window.location.pathname;
    if (path.includes('index.html') || path.endsWith('/admin/')) loadDashboard();
    if (path.includes('add-product.html')) setupAddProduct();
    if (path.includes('products.html')) setupManageProducts();
    if (path.includes('orders.html')) setupOrders();
    if (path.includes('users.html')) setupUsers();
    if (path.includes('history.html')) setupHistory();
    injectToasts();
}

// ─── Dashboard Module ────────────────────────────────────────────────────────
function loadDashboard() {
    onSnapshot(collection(db, "products"), (snap) => {
        const el = document.getElementById('stat-products');
        if (el) el.innerText = snap.size;
    });

    onSnapshot(collection(db, "orders"), (snap) => {
        const el = document.getElementById('stat-orders');
        if (el) el.innerText = snap.size;
        let revenue = 0;
        snap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'delivered') revenue += (data.total || 0);
        });
        const revEl = document.getElementById('stat-sales');
        if (revEl) revEl.innerText = `$${revenue.toFixed(2)}`;
    });

    onSnapshot(collection(db, "users"), (snap) => {
        const el = document.getElementById('stat-users');
        if (el) el.innerText = snap.size;
    });

    const logContainer = document.getElementById('activity-log');
    if (logContainer) {
        onSnapshot(query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(6)), (snap) => {
            if (snap.empty) { logContainer.innerHTML = '<p class="text-muted">No recent activity.</p>'; return; }
            logContainer.innerHTML = snap.docs.map(doc => {
                const log = doc.data();
                const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';
                return `<div class="activity-item"><div class="activity-icon"><i class="fas fa-history"></i></div><div class="activity-info"><p><strong>${log.adminName}</strong> ${log.action} <strong>${log.entity}</strong></p><span>${time}</span></div></div>`;
            }).join('');
        });
    }

    const orderTable = document.querySelector('#latest-orders-table tbody');
    if (orderTable) {
        onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(5)), (snap) => {
            if (snap.empty) { orderTable.innerHTML = '<tr><td colspan="4" class="text-center">No orders yet.</td></tr>'; return; }
            orderTable.innerHTML = snap.docs.map(doc => {
                const o = doc.data();
                return `<tr><td>#${doc.id.substring(0, 8)}</td><td>${o.userName || 'Guest'}</td><td>$${(o.total || 0).toFixed(2)}</td><td><span class="status-pill status-${o.status || 'processing'}">${o.status || 'Processing'}</span></td></tr>`;
            }).join('');
        });
    }
}

// ─── Products Module ─────────────────────────────────────────────────────────
function setupAddProduct() {
    const form = document.getElementById('product-form');
    if (!form) return;

    const fileInput = document.getElementById('productImage');
    const placeholder = document.getElementById('upload-placeholder');
    const preview = document.getElementById('upload-preview');
    const previewImg = document.getElementById('preview-img');
    let selectedFile = null;

    // Handle File Selection & Preview
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = (re) => {
                previewImg.src = re.target.result;
                placeholder.style.display = 'none';
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        
        // Step 1: Loading State
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Product...';

        try {
            // Step 2: Upload to Cloudinary
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            const uploadRes = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
            const uploadData = await uploadRes.json();

            if (!uploadData.secure_url) throw new Error("Image upload failed");

            // Step 3: Save to Firestore
            const product = {
                name: document.getElementById('productName').value,
                price: parseFloat(document.getElementById('productPrice').value),
                category: document.getElementById('category').value,
                stock: parseInt(document.getElementById('stock').value),
                description: document.getElementById('productDescription').value,
                colors: document.getElementById('productColors').value.split(',').map(c => c.trim()).filter(c => c),
                imageUrl: uploadData.secure_url,
                createdAt: Timestamp.now()
            };

            await addDoc(collection(db, "products"), product);
            await logAction('added product', product.name);

            // Step 4: Success Message & Reset
            showToast("Product successfully saved on website!");
            form.reset();
            selectedFile = null;
            preview.style.display = 'none';
            placeholder.style.display = 'block';
            previewImg.src = '';

        } catch (error) {
            console.error(error);
            showToast("Error: " + error.message, "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

function setupManageProducts() {
    const table = document.querySelector('#products-table tbody');
    const search = document.getElementById('product-search');
    const filter = document.getElementById('category-filter');
    if (!table) return;

    onSnapshot(collection(db, "products"), (snap) => {
        const products = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const applyFilters = () => {
            let filtered = products;
            if (filter?.value !== 'all') filtered = filtered.filter(p => p.category === filter.value);
            if (search?.value) {
                const s = search.value.toLowerCase();
                filtered = filtered.filter(p => p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s));
            }
            table.innerHTML = filtered.map(p => `
                <tr>
                    <td><img src="${p.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;"></td>
                    <td><strong>${p.name}</strong></td>
                    <td><span class="badge">${p.category}</span></td>
                    <td>$${(p.price || 0).toFixed(2)}</td>
                    <td>${p.stock}</td>
                    <td>
                        <button class="btn-icon" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" onclick="deleteProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('');
        };
        applyFilters();
        search?.addEventListener('input', applyFilters);
        filter?.addEventListener('change', applyFilters);
    });
}

// ─── Utility Modules ──────────────────────────────────────────────────────────
function setupOrders() {
    const table = document.querySelector('#orders-full-table tbody');
    if (!table) return;
    onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
        table.innerHTML = snap.docs.map(doc => {
            const o = doc.data();
            return `<tr><td>#${doc.id.substring(0, 8)}</td><td><strong>${o.userName || 'Guest'}</strong></td><td>$${(o.total || 0).toFixed(2)}</td><td>${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : 'N/A'}</td><td><span class="status-pill status-${o.status || 'processing'}">${o.status || 'Processing'}</span></td><td><button class="btn btn-outline btn-sm" onclick="viewOrder('${doc.id}')">Manage</button></td></tr>`;
        }).join('');
    });
}

function setupUsers() {
    const table = document.querySelector('#users-table tbody');
    if (!table) return;
    onSnapshot(collection(db, "users"), (snap) => {
        table.innerHTML = snap.docs.map(doc => {
            const u = doc.data();
            return `<tr><td><strong>${u.fullName || 'User'}</strong></td><td>${u.email}</td><td><span class="badge ${u.role}">${u.role}</span></td><td>${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'N/A'}</td><td><button class="btn btn-outline btn-sm" onclick="openUserRoleModal('${doc.id}', '${u.fullName}', '${u.role}')">Edit</button></td></tr>`;
        }).join('');
    });
}

function setupHistory() {
    const table = document.querySelector('#history-table tbody');
    if (!table) return;
    onSnapshot(query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(50)), (snap) => {
        table.innerHTML = snap.docs.map(doc => {
            const l = doc.data();
            return `<tr><td>${l.timestamp?.toDate ? l.timestamp.toDate().toLocaleString() : 'Just now'}</td><td><strong>${l.adminName}</strong></td><td>${l.action}</td><td>${l.entity}</td></tr>`;
        }).join('');
    });
}

async function logAction(action, entity) {
    if (!currentAdmin) return;
    await addDoc(collection(db, "adminLogs"), { adminId: currentAdmin.uid, adminName: currentAdmin.fullName || 'Admin', action, entity, timestamp: Timestamp.now() });
}

window.deleteProduct = async (id, name) => {
    if (confirm(`Delete "${name}"?`)) {
        await deleteDoc(doc(db, "products", id));
        await logAction('deleted product', name);
        showToast("Product deleted successfully.");
    }
};

window.showToast = (msg, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
};

function injectToasts() {
    if (!document.getElementById('toast-container')) {
        const c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c);
    }
}
