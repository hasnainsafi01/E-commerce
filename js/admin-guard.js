/**
 * Admin Security Guard - DEBUG MODE (Bypass Active)
 * Temporarily allows direct access to admin routes for debugging.
 */

// ─── UI refs ──────────────────────────────────────────────────────────────────
const loader    = document.getElementById('admin-loader');

function hideLoader() {
    document.body.classList.remove('admin-loading');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => { loader.style.display = 'none'; }, 400);
    }
}

// DEBUG: Immediately reveal UI and allow admin.js to start
console.warn("ADMIN SECURITY BYPASS ACTIVE: Running in Debug Mode.");

// Dispatch mock event so admin.js starts immediately with a dummy admin profile
document.dispatchEvent(new CustomEvent('admin-verified', {
    detail: { 
        user: { 
            uid: "debug-admin", 
            fullName: "Debug Administrator", 
            role: "admin",
            email: "debug@mymart.com" 
        } 
    }
}));

hideLoader();
