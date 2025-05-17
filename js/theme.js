(() => {
    const key = 'cheemaql-theme';
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    let preference;
    try { preference = localStorage.getItem(key); } catch { /* Theme still works without storage. */ }
    if (!['light', 'dark'].includes(preference)) preference = null;

    function apply(theme) {
        document.documentElement.dataset.theme = theme;
        document.querySelectorAll('.theme-toggle').forEach(button => {
            const dark = theme === 'dark';
            button.innerHTML = dark
                ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>';
            button.setAttribute('aria-pressed', String(dark));
            button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
            button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
        });
    }

    // Run in the head to apply the saved theme before the page is painted.
    apply(preference || (system.matches ? 'dark' : 'light'));
    document.addEventListener('DOMContentLoaded', () => {
        apply(document.documentElement.dataset.theme);
        document.querySelectorAll('.theme-toggle').forEach(button => {
            button.addEventListener('click', () => {
                preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
                try { localStorage.setItem(key, preference); } catch { /* Keep the current-page choice. */ }
                apply(preference);
            });
        });
    });
    system.addEventListener('change', () => {
        if (!preference) apply(system.matches ? 'dark' : 'light');
    });
    window.addEventListener('storage', event => {
        if (event.key !== key && event.key !== null) return;
        preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
        apply(preference || (system.matches ? 'dark' : 'light'));
    });
})();
