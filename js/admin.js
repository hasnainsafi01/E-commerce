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
        
        if (!selectedFile) {
            showToast("Please select a product image", "error");
            return;
        }

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
                productName: document.getElementById('productName').value.trim(),
                productPrice: parseFloat(document.getElementById('productPrice').value),
                category: document.getElementById('category').value,
                stock: parseInt(document.getElementById('stock').value) || 0,
                productDescription: document.getElementById('productDescription').value.trim(),
                colors: document.getElementById('productColors').value.split(',').map(c => c.trim()).filter(c => c),
                sizes: document.getElementById('productSizes').value.split(',').map(s => s.trim()).filter(s => s),
                variants: document.getElementById('productVariants').value.split(',').map(v => v.trim()).filter(v => v),
                productImage: uploadData.secure_url,
                imageUrl: uploadData.secure_url, // Compatibility
                createdAt: Timestamp.now()
            };

            await addDoc(collection(db, "products"), product);
            await logAction('added product', product.productName);

            // Step 4: Success Message & Reset
            showToast("Product successfully added to " + product.category);
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

    onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snap) => {
        const products = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const applyFilters = () => {
            let filtered = products;
            if (filter?.value !== 'all') filtered = filtered.filter(p => p.category === filter.value);
            if (search?.value) {
                const s = search.value.toLowerCase();
                filtered = filtered.filter(p => (p.productName || p.name || '').toLowerCase().includes(s) || (p.category || '').toLowerCase().includes(s));
            }
            table.innerHTML = filtered.map(p => `
                <tr>
                    <td><img src="${p.productImage || p.imageUrl}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid #eee;"></td>
                    <td>
                        <div style="font-weight: 700; color: var(--admin-text);">${p.productName || p.name}</div>
                        <div style="font-size: 0.75rem; color: var(--admin-text-muted);">ID: ${p.id.substring(0,8)}</div>
                    </td>
                    <td><span class="badge" style="background: #f0f2f5; color: var(--admin-text);">${p.category}</span></td>
                    <td><strong style="color: var(--admin-primary);">$${parseFloat(p.productPrice || p.price || 0).toFixed(2)}</strong></td>
                    <td>
                        <div style="font-weight: 600; color: ${p.stock < 10 ? '#cf1322' : 'inherit'}">${p.stock || 0}</div>
                        ${p.stock < 10 ? '<span style="font-size: 0.65rem; color: #cf1322; font-weight: 700; text-transform: uppercase;">Low Stock</span>' : ''}
                    </td>
                    <td>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn-icon" onclick="editProduct('${p.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                            <button class="btn-icon delete" onclick="deleteProduct('${p.id}', '${(p.productName || p.name || 'Product').replace(/'/g, "\\'")}')" title="Delete"><i class="fas fa-trash"></i></button>
                        </div>
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
    if (confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
        await deleteDoc(doc(db, "products", id));
        await logAction('deleted product', name);
        showToast("Product deleted successfully.");
    }
};

// ─── Modal System ────────────────────────────────────────────────────────────
function injectModalContainer() {
    if (document.getElementById('admin-modal-overlay')) return;
    const modalHTML = `
        <div class="modal-overlay" id="admin-modal-overlay">
            <div class="admin-modal" id="admin-modal-content">
                <!-- Dynamic Content -->
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    document.getElementById('admin-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'admin-modal-overlay') closeModal();
    });
}

window.closeModal = () => {
    const modal = document.getElementById('admin-modal-overlay');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
};

function showModal(html) {
    injectModalContainer();
    const content = document.getElementById('admin-modal-content');
    const overlay = document.getElementById('admin-modal-overlay');
    content.innerHTML = html;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// ─── Order Details ───────────────────────────────────────────────────────────
window.viewOrder = async (orderId) => {
    const orderDoc = await getDoc(doc(db, "orders", orderId));
    if (!orderDoc.exists()) return;
    const o = orderDoc.data();
    const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : 'N/A';

    const modalHTML = `
        <div class="modal-header">
            <h2>Order Details: #${orderId.substring(0, 8)}</h2>
            <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="order-detail-grid">
                <div class="detail-item"><label>Customer</label><p>${o.userName || 'Guest'}</p></div>
                <div class="detail-item"><label>Email</label><p>${o.userEmail || 'N/A'}</p></div>
                <div class="detail-item"><label>Date</label><p>${date}</p></div>
                <div class="detail-item"><label>Total Price</label><p>$${(o.total || 0).toFixed(2)}</p></div>
            </div>
            
            <div class="form-group" style="margin-bottom: 2rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 700;">Order Status</label>
                <select id="update-order-status" class="btn btn-outline" style="width: 100%; padding: 0.8rem;">
                    <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>Processing</option>
                    <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Shipped</option>
                    <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </div>

            <h3 style="font-size: 1rem; margin-bottom: 1rem;">Items Summary</h3>
            <div class="order-items-list">
                ${(o.items || []).map(item => `
                    <div class="order-item">
                        <img src="${item.productImage || item.imageUrl}">
                        <div class="order-item-info">
                            <h4>${item.productName || item.name}</h4>
                            <span>Qty: ${item.qty} • ${item.selectedColor || 'Default'}</span>
                        </div>
                        <div class="order-item-price">$${(parseFloat(item.productPrice || item.price) * item.qty).toFixed(2)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeModal()">Close</button>
            <button class="btn btn-primary" onclick="updateOrderStatus('${orderId}')">Save Status</button>
        </div>
    `;
    showModal(modalHTML);
};

window.updateOrderStatus = async (orderId) => {
    const newStatus = document.getElementById('update-order-status').value;
    try {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus });
        await logAction('updated order status', orderId.substring(0, 8));
        showToast(`Order status updated to ${newStatus}`);
        closeModal();
    } catch (error) {
        showToast(error.message, "error");
    }
};

// ─── Edit Product ────────────────────────────────────────────────────────────
window.editProduct = async (productId) => {
    const pDoc = await getDoc(doc(db, "products", productId));
    if (!pDoc.exists()) return;
    const p = pDoc.data();

    const modalHTML = `
        <div class="modal-header">
            <h2>Edit Product</h2>
            <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
            <form id="edit-product-form" class="admin-form" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group" style="grid-column: span 2;">
                    <label>Product Name</label>
                    <input type="text" id="edit-name" value="${p.productName || p.name}" required>
                </div>
                <div class="form-group">
                    <label>Price ($)</label>
                    <input type="number" id="edit-price" value="${p.productPrice || p.price}" step="0.01" required>
                </div>
                <div class="form-group">
                    <label>Stock</label>
                    <input type="number" id="edit-stock" value="${p.stock || 0}" required>
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label>Category</label>
                    <select id="edit-category" required>
                        <option value="shoes" ${p.category === 'shoes' ? 'selected' : ''}>Shoes</option>
                        <option value="bags" ${p.category === 'bags' ? 'selected' : ''}>Bags</option>
                        <option value="watches" ${p.category === 'watches' ? 'selected' : ''}>Watches</option>
                        <option value="glasses" ${p.category === 'glasses' ? 'selected' : ''}>Glasses</option>
                        <option value="men" ${p.category === 'men' ? 'selected' : ''}>Men</option>
                        <option value="women" ${p.category === 'women' ? 'selected' : ''}>Women</option>
                        <option value="electronics" ${p.category === 'electronics' ? 'selected' : ''}>Electronics</option>
                        <option value="home" ${p.category === 'home' ? 'selected' : ''}>Home</option>
                    </select>
                </div>
            </form>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="updateProduct('${productId}')">Save Changes</button>
        </div>
    `;
    showModal(modalHTML);
};

window.updateProduct = async (productId) => {
    const data = {
        productName: document.getElementById('edit-name').value.trim(),
        productPrice: parseFloat(document.getElementById('edit-price').value),
        stock: parseInt(document.getElementById('edit-stock').value),
        category: document.getElementById('edit-category').value,
        updatedAt: Timestamp.now()
    };

    try {
        await updateDoc(doc(db, "products", productId), data);
        await logAction('updated product', data.productName);
        showToast("Product updated successfully.");
        closeModal();
    } catch (error) {
        showToast(error.message, "error");
    }
};

window.showToast = (msg, type = 'success') => {
    injectToastContainer();
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${msg}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
};

function injectToastContainer() {
    if (document.getElementById('toast-container')) return;
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.style.cssText = 'position: fixed; top: 2rem; right: 2rem; z-index: 10000; display: flex; flex-direction: column; gap: 0.75rem;';
    document.body.appendChild(div);
}
};

// ─── User Role Management ───────────────────────────────────────────────────
window.openUserRoleModal = (userId, name, currentRole) => {
    const modalHTML = `
        <div class="modal-header">
            <h2>Manage User Role</h2>
            <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
            <p>Managing access for: <strong>${name}</strong></p>
            <div class="form-group" style="margin-top: 1.5rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 700;">Assign Role</label>
                <select id="update-user-role" class="btn btn-outline" style="width: 100%; padding: 0.8rem;">
                    <option value="user" ${currentRole === 'user' ? 'selected' : ''}>Standard User</option>
                    <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Administrator</option>
                </select>
            </div>
            <p style="font-size: 0.8rem; color: var(--admin-text-muted); margin-top: 1rem;">
                <i class="fas fa-info-circle"></i> Granting administrator privileges allows full access to this dashboard.
            </p>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="updateUserRole('${userId}', '${name}')">Update Role</button>
        </div>
    `;
    showModal(modalHTML);
};

window.updateUserRole = async (userId, name) => {
    const newRole = document.getElementById('update-user-role').value;
    try {
        await updateDoc(doc(db, "users", userId), { role: newRole });
        await logAction('updated user role', `${name} (${newRole})`);
        showToast(`Role updated successfully for ${name}`);
        closeModal();
    } catch (error) {
        showToast(error.message, "error");
    }
};

function injectToasts() {
    if (!document.getElementById('toast-container')) {
        const c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c);
    }
}
