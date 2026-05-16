class AuthManager {
    constructor() {
        this.user = null;
        this.isAuthenticated = false;
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.updateUI();
        this.setupLogoutHandler();
    }

    // Just modify the checkAuthStatus method
    async checkAuthStatus() {
        try {
            const response = await fetch('/auth/status', { credentials: 'include' });

            // If the endpoint returned a non-OK status, treat as unauthenticated
            if (!response.ok) {
                this.isAuthenticated = false;
                this.user = null;
                return;
            }

            const data = await response.json();

            this.isAuthenticated = !!data.authenticated;
            this.user = data.user || null;

            // Debug log only when explicitly enabled
            if (window.DEBUG_AUTH) {
                console.log('Auth status:', {
                    authenticated: this.isAuthenticated,
                    user: this.user
                });
            }

            // If already authenticated and currently on the login page, redirect to the app
            try {
                const path = window.location.pathname || '';
                if (this.isAuthenticated && (path.endsWith('/login.html') || path === '/login' || path === '/login.html')) {
                    // remove any error query param to avoid showing stale error messages after redirect
                    const url = new URL(window.location.href);
                    url.searchParams.delete('error');
                    // redirect to main page
                    window.location.href = '/index.html';
                    return;
                }
            } catch (e) {
                // ignore URL/redirect errors
            }

        } catch (error) {
            console.error('Failed to check auth status:', error);
            this.isAuthenticated = false;
            this.user = null;
        }
    }

    updateUI() {
        // Update login/logout button
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const userInfo = document.getElementById('userInfo');
        const userEmail = document.getElementById('userEmail');

        if (this.isAuthenticated && this.user) {
            // User is logged in
            if (loginBtn) loginBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (userInfo) userInfo.style.display = 'inline-block';
            if (userEmail) userEmail.textContent = this.user.email;
            
            // Update welcome message if it exists
            const welcomeMsg = document.getElementById('welcomeMessage');
            if (welcomeMsg) {
                welcomeMsg.textContent = `Welcome, ${this.user.name || this.user.email}!`;
            }
        } else {
            // User is not logged in
            if (loginBtn) loginBtn.style.display = 'inline-block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (userInfo) userInfo.style.display = 'none';
            if (userEmail) userEmail.textContent = '';
            
            const welcomeMsg = document.getElementById('welcomeMessage');
            if (welcomeMsg) {
                welcomeMsg.textContent = 'Please login to access all features';
            }
        }

        // Hide/show protected content
        const protectedElements = document.querySelectorAll('.protected-content');
        const loginPrompt = document.querySelectorAll('.login-prompt');
        
        protectedElements.forEach(element => {
            element.style.display = this.isAuthenticated ? 'block' : 'none';
        });
        
        loginPrompt.forEach(element => {
            element.style.display = this.isAuthenticated ? 'none' : 'block';
        });
    }

    setupLogoutHandler() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await fetch('/auth/logout');
                    window.location.href = '/login.html';
                } catch (error) {
                    console.error('Logout failed:', error);
                    // Force redirect anyway
                    window.location.href = '/login.html';
                }
            });
        }
    }

    // Method to check if user is authenticated (for use in other scripts)
    isLoggedIn() {
        return this.isAuthenticated;
    }

    // Method to get current user (for use in other scripts)
    getCurrentUser() {
        return this.user;
    }

    // Method to redirect to login if not authenticated
    requireAuth(redirectUrl = '/login.html') {
        if (!this.isAuthenticated) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }
}

// Global instance
window.authManager = new AuthManager();

// Utility functions for backward compatibility
window.isAuthenticated = () => window.authManager.isLoggedIn();
window.getCurrentUser = () => window.authManager.getCurrentUser();
window.requireAuth = (url) => window.authManager.requireAuth(url);
