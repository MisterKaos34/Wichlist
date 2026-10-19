async function analyzeProductUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Saisissez une URL valide.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Seules les adresses HTTP et HTTPS sont acceptées.');
    const { data, error } = await window.supabaseClient.functions.invoke('quick-action', { body: { url: parsed.href } });
    if (error) {
        const status = error.context?.status ?? error.status;
        if (status === 404) {
            throw new Error('La fonction quick-action est introuvable dans votre projet Supabase. Vérifiez son déploiement. Vous pouvez saisir les informations manuellement.');
        }
        throw new Error(status
            ? `L’analyse a échoué (HTTP ${status}). Vous pouvez saisir les informations manuellement.`
            : 'L’analyse est indisponible. Vous pouvez saisir les informations manuellement.');
    }
    return data;
}