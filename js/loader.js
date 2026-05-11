/**
 * MyMart Global Loader System
 * Handles startup, page transitions, skeleton loading, and offline states.
 */

(function () {
    'use strict';

    // ─── State ───────────────────────────────────────────────────────────────
    let _startupHidden = false;
    let _pageLoaderActive = false;
    let _offlineActive = false;

    // ─── DOM Refs ──────────────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);

    // ─── Startup Loader ────────────────────────────────────────────────────────
    function showStartup() {
        const el = $('mm-startup-loader');
        if (el) el.classList.remove('hidden');
    }

    function hideStartup(delay = 400) {
        if (_startupHidden) return;
        _startupHidden = true;
        setTimeout(() => {
            const el = $('mm-startup-loader');
            if (el) el.classList.add('hidden');
            // Fade in page content
            document.body.classList.add('mm-page-fade-in');
        }, delay);
    }

    // ─── Page Transition Loader ──────────────────────────────────────────────
    function showPageLoader(message = 'Loading...') {
        const el = $('mm-page-loader');
        const msgEl = el?.querySelector('.mm-page-loader-text');
        if (msgEl) msgEl.textContent = message;
        if (el) el.classList.add('active');
        _pageLoaderActive = true;
    }

    function hidePageLoader() {
        const el = $('mm-page-loader');
        if (el) el.classList.remove('active');
        _pageLoaderActive = false;
    }

    // ─── Skeleton Loading ──────────────────────────────────────────────────────
    function injectSkeletons(gridEl, count = 4) {
        if (!gridEl) return;
        const html = Array.from({ length: count }, () => `
            <div class="mm-skeleton-card">
                <div class="mm-skeleton mm-skeleton-img"></div>
                <div class="mm-skeleton-body">
                    <div class="mm-skeleton mm-skeleton-title"></div>
                    <div class="mm-skeleton mm-skeleton-price"></div>
                    <div class="mm-skeleton mm-skeleton-btn"></div>
                </div>
            </div>
        `).join('');
        gridEl.innerHTML = html;
    }

    function clearSkeletons(gridEl) {
        if (!gridEl) return;
        const skeletons = gridEl.querySelectorAll('.mm-skeleton-card');
        skeletons.forEach((el) => el.remove());
    }

    // ─── Offline State ───────────────────────────────────────────────────────
    function showOffline() {
        const el = $('mm-offline-state');
        if (el) el.classList.add('active');
        _offlineActive = true;
    }

    function hideOffline() {
        const el = $('mm-offline-state');
        if (el) el.classList.remove('active');
        _offlineActive = false;
    }

    function setupOnlineDetection() {
        const update = () => {
            if (navigator.onLine) {
                if (_offlineActive) hideOffline();
            } else {
                showOffline();
            }
        };
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        // Initial check after a short delay to avoid flash on fast connections
        setTimeout(update, 800);
    }

    // ─── Page Transition Interception ────────────────────────────────────────
    function setupPageTransitions() {
        // Only intercept clicks on same-origin links
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href) return;

            // Skip external, anchor-only, javascript:, mailto:, tel:
            if (
                href.startsWith('#') ||
                href.startsWith('javascript:') ||
                href.startsWith('mailto:') ||
                href.startsWith('tel:') ||
                link.target === '_blank' ||
                link.hasAttribute('download') ||
                e.ctrlKey || e.metaKey || e.shiftKey
            ) return;

            // Skip if different origin
            try {
                const url = new URL(href, window.location.href);
                if (url.origin !== window.location.origin) return;
            } catch {
                return;
            }

            e.preventDefault();
            showPageLoader('Loading...');

            // Small delay so the loader actually renders before navigation freeze
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.location.href = href;
                });
            });
        });
    }

    // ─── Auto-hide startup on page load ──────────────────────────────────────
    function initStartup() {
        // Show startup immediately (CSS handles visibility)
        showStartup();

        // Hide when DOM is ready + minimum display time
        const minDisplay = 900; // ms
        const start = performance.now();

        const finish = () => {
            const elapsed = performance.now() - start;
            const remaining = Math.max(0, minDisplay - elapsed);
            hideStartup(remaining);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', finish);
        } else {
            finish();
        }

        // Also hide when window fully loaded (images, etc.)
        window.addEventListener('load', () => hideStartup(200));
    }

    // ─── Admin Panel Integration ─────────────────────────────────────────────
    function initAdminLoader() {
        // Admin pages: simpler startup, hide quickly
        const isAdmin = window.location.pathname.includes('/admin/');
        if (isAdmin) {
            hideStartup(300);
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    window.Loader = {
        show: showPageLoader,
        hide: hidePageLoader,
        showStartup,
        hideStartup,
        skeleton: injectSkeletons,
        clearSkeleton: clearSkeletons,
        showOffline,
        hideOffline,
        isOffline: () => _offlineActive,
        isLoading: () => _pageLoaderActive,
    };

    // ─── Initialize ──────────────────────────────────────────────────────────
    initStartup();
    setupOnlineDetection();
    setupPageTransitions();
    initAdminLoader();
})();
