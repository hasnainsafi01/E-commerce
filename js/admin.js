/**
 * MyMart Admin - Fresh Rebuilt Stable Architecture
 * Centralized logic for Dashboard, Products, Orders, Users, and Logs.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, updateDoc, deleteDoc, collection, 
    query, where, onSnapshot, orderBy, limit, addDoc, Timestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Configuration (Matching current workspace)
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
    
    // Determine which module to load
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
    // Stats Listeners
    onSnapshot(collection(db, "products"), (snap) => {
        const el = document.getElementById('stat-products');
        if (el) el.innerText = snap.size;
    });

    onSnapshot(collection(db, "orders"), (snap) => {
        const el = document.getElementById('stat-orders');
        if (el) el.innerText = snap.size;
        
        // Calculate Revenue (delivered only)
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

    // Recent Activity Feed
    const logContainer = document.getElementById('activity-log');
    if (logContainer) {
        onSnapshot(query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(6)), (snap) => {
            if (snap.empty) {
                logContainer.innerHTML = '<p class="text-muted">No recent activity.</p>';
                return;
            }
            logContainer.innerHTML = snap.docs.map(doc => {
                const log = doc.data();
                const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';
                return `
                    <div class="activity-item">
                        <div class="activity-icon"><i class="fas fa-history"></i></div>
                        <div class="activity-info">
                            <p><strong>${log.adminName}</strong> ${log.action} <strong>${log.entity}</strong></p>
                            <span>${time}</span>
                        </div>
                    </div>
                `;
            }).join('');
        });
    }

    // Latest Orders Preview
    const orderTable = document.querySelector('#latest-orders-table tbody');
    if (orderTable) {
        onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(5)), (snap) => {
            if (snap.empty) {
                orderTable.innerHTML = '<tr><td colspan="4" class="text-center">No orders yet.</td></tr>';
                return;
            }
            orderTable.innerHTML = snap.docs.map(doc => {
                const o = doc.data();
                return `
                    <tr>
                        <td>#${doc.id.substring(0, 8)}</td>
                        <td>${o.userName || 'Guest'}</td>
                        <td>$${(o.total || 0).toFixed(2)}</td>
                        <td><span class="status-pill status-${o.status || 'processing'}">${o.status || 'Processing'}</span></td>
                    </tr>
                `;
            }).join('');
        });
    }
}

// ─── Products Module ─────────────────────────────────────────────────────────
function setupAddProduct() {
    const form = document.getElementById('product-form');
    if (!form) return;

    // Handle local image preview
    const imageInput = document.getElementById('productImageUrl');
    const previewImg = document.getElementById('preview-img');
    const dropzone = document.getElementById('image-dropzone');

    if (imageInput) {
        imageInput.addEventListener('input', (e) => {
            if (e.target.value) {
                previewImg.src = e.target.value;
                dropzone.querySelector('div').style.display = 'none';
                previewImg.style.display = 'block';
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        const product = {
            name: document.getElementById('productName').value,
            price: parseFloat(document.getElementById('productPrice').value),
            category: document.getElementById('category').value,
            stock: parseInt(document.getElementById('stock').value),
            description: document.getElementById('productDescription').value,
            colors: document.getElementById('productColors').value.split(',').map(c => c.trim()).filter(c => c),
            imageUrl: document.getElementById('productImageUrl').value,
            createdAt: Timestamp.now()
        };

        try {
            await addDoc(collection(db, "products"), product);
            await logAction('added product', product.name);
            showToast("Product added successfully!");
            form.reset();
            previewImg.style.display = 'none';
            dropzone.querySelector('div').style.display = 'block';
        } catch (error) {
            console.error(error);
            showToast("Error adding product.", "error");
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save Product';
        }
    });
}

function setupManageProducts() {
    const table = document.querySelector('#products-table tbody');
    const search = document.getElementById('product-search');
    const filter = document.getElementById('category-filter');
    
    if (!table) return;

    let allProducts = [];

    const render = (items) => {
        if (items.length === 0) {
            table.innerHTML = '<tr><td colspan="6" class="text-center">No products found.</td></tr>';
            return;
        }
        table.innerHTML = items.map(p => `
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
            </tr>
        `).join('');
    };

    onSnapshot(collection(db, "products"), (snap) => {
        allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilters();
    });

    const applyFilters = () => {
        let filtered = allProducts;
        if (filter && filter.value !== 'all') filtered = filtered.filter(p => p.category === filter.value);
        if (search && search.value) {
            const s = search.value.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s));
        }
        render(filtered);
    };

    if (search) search.addEventListener('input', applyFilters);
    if (filter) filter.addEventListener('change', applyFilters);
}

// ─── Orders Module ───────────────────────────────────────────────────────────
function setupOrders() {
    const table = document.querySelector('#orders-full-table tbody');
    if (!table) return;

    onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
        if (snap.empty) {
            table.innerHTML = '<tr><td colspan="6" class="text-center">No orders found.</td></tr>';
            return;
        }
        table.innerHTML = snap.docs.map(doc => {
            const o = doc.data();
            const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : 'N/A';
            return `
                <tr>
                    <td>#${doc.id.substring(0, 8)}</td>
                    <td><strong>${o.userName || 'Guest'}</strong><br><small>${o.userEmail || ''}</small></td>
                    <td>$${(o.total || 0).toFixed(2)}</td>
                    <td>${date}</td>
                    <td><span class="status-pill status-${o.status || 'processing'}">${o.status || 'Processing'}</span></td>
                    <td><button class="btn btn-outline btn-sm" onclick="viewOrder('${doc.id}')">Manage</button></td>
                </tr>
            `;
        }).join('');
    });
}

// ─── Users Module ────────────────────────────────────────────────────────────
function setupUsers() {
    const table = document.querySelector('#users-table tbody');
    if (!table) return;

    onSnapshot(collection(db, "users"), (snap) => {
        if (snap.empty) {
            table.innerHTML = '<tr><td colspan="5" class="text-center">No users registered.</td></tr>';
            return;
        }
        table.innerHTML = snap.docs.map(doc => {
            const u = doc.data();
            const joined = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'N/A';
            return `
                <tr>
                    <td><strong>${u.fullName || 'User'}</strong></td>
                    <td>${u.email}</td>
                    <td><span class="badge ${u.role === 'admin' ? 'admin' : ''}">${u.role}</span></td>
                    <td>${joined}</td>
                    <td><button class="btn btn-outline btn-sm" onclick="openUserRoleModal('${doc.id}', '${u.fullName}', '${u.role}')">Edit</button></td>
                </tr>
            `;
        }).join('');
    });
}

// ─── History Module ──────────────────────────────────────────────────────────
function setupHistory() {
    const table = document.querySelector('#history-table tbody');
    if (!table) return;

    onSnapshot(query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(50)), (snap) => {
        if (snap.empty) {
            table.innerHTML = '<tr><td colspan="4" class="text-center">No logs found.</td></tr>';
            return;
        }
        table.innerHTML = snap.docs.map(doc => {
            const l = doc.data();
            const time = l.timestamp?.toDate ? l.timestamp.toDate().toLocaleString() : 'Just now';
            return `
                <tr>
                    <td>${time}</td>
                    <td><strong>${l.adminName}</strong></td>
                    <td>${l.action}</td>
                    <td>${l.entity}</td>
                </tr>
            `;
        }).join('');
    });
}

// ─── Utility Actions ──────────────────────────────────────────────────────────
async function logAction(action, entity) {
    if (!currentAdmin) return;
    try {
        await addDoc(collection(db, "adminLogs"), {
            adminId: currentAdmin.uid,
            adminName: currentAdmin.fullName || 'Admin',
            action,
            entity,
            timestamp: Timestamp.now()
        });
    } catch (e) { console.error("Log error:", e); }
}

// Global actions exposed to HTML
window.deleteProduct = async (id, name) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
        try {
            await deleteDoc(doc(db, "products", id));
            await logAction('deleted product', name);
            showToast("Product deleted successfully.");
        } catch (e) { showToast("Error deleting product.", "error"); }
    }
};

window.editProduct = async (id) => {
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) return;
    const p = snap.data();
    
    // Simple edit prompt for stability (or you can open a modal if you prefer)
    const newName = prompt("Edit Product Name:", p.name);
    const newPrice = prompt("Edit Product Price:", p.price);
    
    if (newName && newPrice) {
        await updateDoc(doc(db, "products", id), {
            name: newName,
            price: parseFloat(newPrice)
        });
        await logAction('edited product', newName);
        showToast("Product updated!");
    }
};

window.viewOrder = async (id) => {
    const snap = await getDoc(doc(db, "orders", id));
    if (!snap.exists()) return;
    const o = snap.data();
    
    // Simple status update for stability
    const newStatus = prompt("Enter new status (processing, shipped, delivered, cancelled):", o.status || 'processing');
    if (newStatus) {
        await updateDoc(doc(db, "orders", id), { status: newStatus.toLowerCase() });
        await logAction('updated order status', '#' + id.substring(0,8));
        showToast("Order status updated!");
    }
};

window.openUserRoleModal = async (id, name, currentRole) => {
    const newRole = prompt(`Change role for ${name} (user/admin):`, currentRole);
    if (newRole && (newRole === 'user' || newRole === 'admin')) {
        await updateDoc(doc(db, "users", id), { role: newRole });
        await logAction('updated user role', name);
        showToast("User role updated!");
    }
};

// ─── Toast System ─────────────────────────────────────────────────────────────
function injectToasts() {
    if (document.getElementById('toast-container')) return;
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
