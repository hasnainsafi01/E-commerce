/**
 * Chenari Admin Core Logic
 * Handles Dashboard stats, Product CRUD, Order management, and Activity logs.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentAdmin = null;

// Initialize
// Initialize only after guard has verified the admin
document.addEventListener('admin-verified', (e) => {
    currentAdmin = e.detail.user;
    const adminNameEl = document.getElementById('admin-name');
    if (adminNameEl) adminNameEl.innerText = currentAdmin.fullName || 'Admin';
    initDashboard();
});

function initDashboard() {
    const path = window.location.pathname;
    if (path.includes('index.html')) loadOverview();
    if (path.includes('add-product.html')) setupAddProduct();
    if (path.includes('products.html')) loadManageProducts();
    if (path.includes('orders.html')) loadOrders();
    if (path.includes('history.html')) loadHistory();
    injectToastContainer();
}

/**
 * Global Toast System for Admin
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

    const timer = setTimeout(() => dismissToast(toast), duration);
    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(timer);
        dismissToast(toast);
    });
}

function dismissToast(toast) {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove());
}

/**
 * Overview Logic
 */
async function loadOverview() {
    // Stats
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
            if (doc.data().status !== 'cancelled') revenue += doc.data().total || 0;
        });
        document.getElementById('stat-sales').innerText = `$${revenue.toFixed(2)}`;
    });

    // Latest Orders
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(5));
    onSnapshot(q, (snap) => {
        const tbody = document.querySelector('#latest-orders-table tbody');
        const empty = document.getElementById('orders-empty');
        if (snap.empty) {
            empty.style.display = 'block';
            tbody.innerHTML = '';
            return;
        }
        empty.style.display = 'none';
        tbody.innerHTML = snap.docs.map(doc => {
            const order = doc.data();
            return `
                <tr>
                    <td>#${doc.id.substring(0, 8)}</td>
                    <td>${order.userName}</td>
                    <td>$${order.total.toFixed(2)}</td>
                    <td><span class="status-pill status-${order.status}">${order.status}</span></td>
                </tr>
            `;
        }).join('');
    });

    // Recent Activity
    const logQ = query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(6));
    onSnapshot(logQ, (snap) => {
        const logContainer = document.getElementById('activity-log');
        const empty = document.getElementById('logs-empty');
        if (snap.empty) {
            empty.style.display = 'block';
            logContainer.innerHTML = '';
            return;
        }
        empty.style.display = 'none';
        logContainer.innerHTML = snap.docs.map(doc => {
            const log = doc.data();
            const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString() : 'Just now';
            return `
                <div style="display: flex; gap: 1rem; align-items: flex-start;">
                    <div style="width: 32px; height: 32px; background: #eee; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-edit" style="font-size: 0.8rem;"></i>
                    </div>
                    <div>
                        <p style="font-size: 0.9rem; margin: 0;"><strong>${log.adminName}</strong> ${log.action} <strong>${log.entity}</strong></p>
                        <span style="font-size: 0.75rem; color: var(--admin-text-muted);">${time}</span>
                    </div>
                </div>
            `;
        }).join('');
    });
}

/**
 * Add Product Logic
 */
function setupAddProduct() {
    const dropzone = document.getElementById('image-dropzone');
    const fileInput = document.getElementById('productImage');
    const previewContainer = document.getElementById('image-preview-container');
    const form = document.getElementById('product-form');
    let uploadedImageUrl = null;

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            window.showToast('Please upload only JPG, PNG, or WEBP images.', 'error');
            fileInput.value = '';
            return;
        }

        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewContainer.innerHTML = `<img src="${e.target.result}" class="preview-img">`;
        };
        reader.readAsDataURL(file);

        // Upload to Cloudinary
        dropzone.querySelector('p').innerText = "Uploading to Cloudinary...";
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', 'shophub_products'); 
            formData.append('folder', 'E-commerce');

            const res = await fetch('https://api.cloudinary.com/v1_1/dqsvcn94y/image/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!res.ok) throw new Error('Cloudinary upload failed');
            
            const data = await res.json();
            uploadedImageUrl = data.secure_url;
            dropzone.querySelector('p').innerText = "Upload Complete!";
            window.showToast("Image uploaded successfully!");
        } catch (error) {
            console.error("Cloudinary Error:", error);
            window.showToast("Upload failed. Check your connection or Cloudinary settings.", "error");
            dropzone.querySelector('p').innerText = "Upload failed. Try again.";
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!uploadedImageUrl) {
            window.showToast("Please upload a product image first.", "error");
            return;
        }

        const product = {
            productName: document.getElementById('productName').value,
            productPrice: parseFloat(document.getElementById('productPrice').value),
            category: document.getElementById('category').value,
            stock: parseInt(document.getElementById('stock').value),
            description: document.getElementById('productDescription').value,
            colors: document.getElementById('productColors').value.split(',').map(c => c.trim()),
            productImage: uploadedImageUrl,
            createdAt: Timestamp.now()
        };

        try {
            const docRef = await addDoc(collection(db, "products"), product);
            await logAction('added', 'product', product.productName);
            window.showToast("Product added successfully!");
            form.reset();
            previewContainer.innerHTML = '';
            uploadedImageUrl = null;
            dropzone.querySelector('p').innerText = "Click or drag image to upload to Cloudinary";
        } catch (error) {
            window.showToast("Error adding product: " + error.message, "error");
        }
    });
}

/**
 * Manage Products Logic
 */
async function loadManageProducts() {
    const table = document.querySelector('#products-table tbody');
    const empty = document.getElementById('products-empty');
    const searchInput = document.getElementById('product-search');
    const catFilter = document.getElementById('category-filter');

    const updateTable = (snap) => {
        if (snap.empty) {
            empty.style.display = 'block';
            table.innerHTML = '';
            return;
        }
        empty.style.display = 'none';
        table.innerHTML = snap.docs.map(doc => {
            const p = doc.data();
            return `
                <tr>
                    <td><img src="${p.productImage}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;"></td>
                    <td><strong>${p.productName}</strong></td>
                    <td><span class="badge badge-light">${p.category}</span></td>
                    <td>$${parseFloat(p.productPrice).toFixed(2)}</td>
                    <td>${p.stock}</td>
                    <td>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-outline btn-sm" onclick="editProduct('${doc.id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-outline btn-sm" style="color: #ff5630;" onclick="deleteProduct('${doc.id}', '${p.productName}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    };

    onSnapshot(collection(db, "products"), updateTable);

    // Filter Logic
    catFilter.addEventListener('change', async () => {
        const cat = catFilter.value;
        let q = collection(db, "products");
        if (cat !== 'all') q = query(q, where("category", "==", cat));
        const snap = await getDocs(q);
        updateTable(snap);
    });
}

/**
 * Orders Management
 */
async function loadOrders() {
    const table = document.querySelector('#orders-full-table tbody');
    const empty = document.getElementById('orders-full-empty');

    onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
        if (snap.empty) {
            empty.style.display = 'block';
            table.innerHTML = '';
            return;
        }
        empty.style.display = 'none';
        table.innerHTML = snap.docs.map(doc => {
            const order = doc.data();
            const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'N/A';
            return `
                <tr>
                    <td>#${doc.id.substring(0, 8)}</td>
                    <td>
                        <strong>${order.userName}</strong><br>
                        <span style="font-size: 0.75rem; color: var(--admin-text-muted);">${order.userEmail}</span>
                    </td>
                    <td>${order.items?.length || 0} items</td>
                    <td><strong>$${(order.total || 0).toFixed(2)}</strong></td>
                    <td>${date}</td>
                    <td><span class="status-pill status-${order.status}">${order.status}</span></td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="viewOrder('${doc.id}')">Manage</button>
                    </td>
                </tr>
            `;
        }).join('');
    });
}

/**
 * Activity Logs Logic
 */
async function loadHistory() {
    const table = document.querySelector('#history-table tbody');
    const empty = document.getElementById('history-empty');

    onSnapshot(query(collection(db, "adminLogs"), orderBy("timestamp", "desc")), (snap) => {
        if (snap.empty) {
            empty.style.display = 'block';
            table.innerHTML = '';
            return;
        }
        empty.style.display = 'none';
        table.innerHTML = snap.docs.map(doc => {
            const log = doc.data();
            const date = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'N/A';
            return `
                <tr>
                    <td>${date}</td>
                    <td><strong>${log.adminName}</strong></td>
                    <td>${log.action}</td>
                    <td>${log.entity}</td>
                    <td><span class="status-pill status-delivered">Success</span></td>
                </tr>
            `;
        }).join('');
    });
}

/**
 * Utilities
 */
async function logAction(action, type, entity) {
    if (!currentAdmin) return;
    await addDoc(collection(db, "adminLogs"), {
        adminId: currentAdmin.uid,
        adminName: currentAdmin.fullName,
        action: action,
        type: type,
        entity: entity,
        timestamp: Timestamp.now()
    });
}

// Global window functions for onclick
window.editProduct = async (id) => {
    const docSnap = await getDoc(doc(db, "products", id));
    if (docSnap.exists()) {
        const p = docSnap.data();
        document.getElementById('edit-id').value = id;
        document.getElementById('edit-name').value = p.productName;
        document.getElementById('edit-price').value = p.productPrice;
        document.getElementById('edit-stock').value = p.stock;
        document.getElementById('editProductModal').style.display = 'flex';
    }
};

window.deleteProduct = async (id, name) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
        await deleteDoc(doc(db, "products", id));
        await logAction('deleted', 'product', name);
    }
};

window.viewOrder = async (id) => {
    const docSnap = await getDoc(doc(db, "orders", id));
    if (docSnap.exists()) {
        const order = docSnap.data();
        const content = document.getElementById('order-detail-content');
        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <p><strong>Customer:</strong> ${order.userName}</p>
                    <p><strong>Email:</strong> ${order.userEmail}</p>
                    <p><strong>Status:</strong> ${order.status}</p>
                </div>
                <div>
                    <p><strong>Order ID:</strong> #${id}</p>
                    <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
                </div>
            </div>
            <hr style="margin: 1rem 0; border: none; border-top: 1px solid #eee;">
            <h4>Items:</h4>
            ${order.items.map(item => `<p>${item.name} x ${item.qty} - $${(item.price * item.qty).toFixed(2)}</p>`).join('')}
        `;
        document.getElementById('update-order-status').value = order.status;
        document.getElementById('orderDetailModal').setAttribute('data-id', id);
        document.getElementById('orderDetailModal').style.display = 'flex';
    }
};

// Modal Listeners
document.addEventListener('DOMContentLoaded', () => {
    const closeEdit = document.getElementById('close-edit-modal');
    if (closeEdit) closeEdit.onclick = () => document.getElementById('editProductModal').style.display = 'none';

    const editForm = document.getElementById('edit-product-form');
    if (editForm) editForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const name = document.getElementById('edit-name').value;
        const price = parseFloat(document.getElementById('edit-price').value);
        const stock = parseInt(document.getElementById('edit-stock').value);

        await updateDoc(doc(db, "products", id), {
            productName: name,
            productPrice: price,
            stock: stock
        });
        await logAction('updated', 'product', name);
        document.getElementById('editProductModal').style.display = 'none';
        alert("Product updated!");
    };

    const closeOrder = document.getElementById('close-order-modal');
    if (closeOrder) closeOrder.onclick = () => document.getElementById('orderDetailModal').style.display = 'none';
    const closeOrderBtn = document.getElementById('close-order-btn');
    if (closeOrderBtn) closeOrderBtn.onclick = () => document.getElementById('orderDetailModal').style.display = 'none';

    const saveOrder = document.getElementById('save-order-status');
    if (saveOrder) saveOrder.onclick = async () => {
        const id = document.getElementById('orderDetailModal').getAttribute('data-id');
        const status = document.getElementById('update-order-status').value;
        await updateDoc(doc(db, "orders", id), { status: status });
        await logAction('changed status to ' + status, 'order', '#' + id.substring(0, 8));
        document.getElementById('orderDetailModal').style.display = 'none';
        alert("Order status updated!");
    };
});
