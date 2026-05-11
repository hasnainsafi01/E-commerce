/**
 * Admin Security Guard - FULL DEBUG MODE
 * AGGRESSIVE BYPASS: No Auth, No Firestore, No Loader.
 */

// Force reveal UI immediately
document.body.classList.remove('admin-loading');
const loader = document.getElementById('admin-loader');
if (loader) loader.style.display = 'none';

// Dispatch mock event so admin.js starts immediately.
// Use setTimeout to ensure admin.js has registered its listener first.
setTimeout(() => {
    document.dispatchEvent(new CustomEvent('admin-verified', {
        detail: { 
            user: { 
                uid: "debug-admin", 
                fullName: "Debug Administrator", 
                role: "admin" 
            } 
        }
    }));
}, 0);

console.warn("ADMIN DEBUG MODE: ALL SECURITY DISABLED.");
