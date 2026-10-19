function setAuthMessage(message, type = 'danger') {
    const element = document.getElementById('auth-message') || document.getElementById('page-message');
    if (!element) return;
    element.textContent = message;
    element.className = `alert alert-${type}`;
    element.hidden = false;
}

async function requireAuthenticatedUser() {
    if (!window.supabaseConfigured) {
        window.location.replace('login.html?setup=1');
        return null;
    }
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error || !data.session) {
        window.location.replace('login.html');
        return null;
    }
    return data.session.user;
}

async function logout() {
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) {
        setAuthMessage(error.message);
        return;
    }
    window.location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const logoutButton = document.getElementById('logout');

    if (!window.supabaseConfigured && (loginForm || signupForm)) {
        setAuthMessage('Configurez l’URL et la clé publique Supabase dans js/supabase.js avant de vous connecter.', 'warning');
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!window.supabaseConfigured) return setAuthMessage('Configurez Supabase dans js/supabase.js avant de vous connecter.', 'warning');
            const button = loginForm.querySelector('[type="submit"]');
            button.disabled = true;
            try {
                const { error } = await window.supabaseClient.auth.signInWithPassword({
                    email: loginForm.elements.email.value.trim(),
                    password: loginForm.elements.password.value
                });
                if (error) return setAuthMessage(error.message);
                window.location.replace('index.html');
            } catch (error) {
                setAuthMessage(error.message || 'Connexion impossible. Vérifiez votre connexion internet.');
            } finally {
                button.disabled = false;
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!window.supabaseConfigured) return setAuthMessage('Configurez Supabase dans js/supabase.js avant de créer un compte.', 'warning');
            const button = signupForm.querySelector('[type="submit"]');
            button.disabled = true;
            try {
                const { data, error } = await window.supabaseClient.auth.signUp({
                    email: signupForm.elements.email.value.trim(),
                    password: signupForm.elements.password.value
                });
                if (error) return setAuthMessage(error.message);
                if (data.session) window.location.replace('index.html');
                else setAuthMessage('Compte créé. Vérifiez votre e-mail pour confirmer votre inscription.', 'success');
            } catch (error) {
                setAuthMessage(error.message || 'Inscription impossible. Vérifiez votre connexion internet.');
            } finally {
                button.disabled = false;
            }
        });
    }

    if (logoutButton) logoutButton.addEventListener('click', logout);

    if ((loginForm || signupForm) && window.supabaseConfigured) {
        const { data } = await window.supabaseClient.auth.getSession();
        if (data.session) window.location.replace('index.html');
    }
});