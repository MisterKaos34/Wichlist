const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
};
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 8_000;

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isPublicIpv4(value: string) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
    const octets = value.split('.').map(Number);
    if (octets.some((octet) => octet < 0 || octet > 255)) return false;
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
}

function isPublicIp(value: string) {
    const ip = value.toLowerCase().replace(/^\[|\]$/g, '');
    if (ip.includes(':')) {
        if (ip.startsWith('::ffff:')) return isPublicIpv4(ip.slice(7));
        if (!/^[23][0-9a-f]{0,3}:/i.test(ip)) return false;
        if (ip.startsWith('2001:0:') || ip.startsWith('2001:db8:') || ip.startsWith('2001:10:') || ip.startsWith('2001:20:') || ip.startsWith('2002:')) return false;
        return true;
    }
    return isPublicIpv4(ip);
}

async function validatePublicUrl(value: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error('URL invalide.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Seules les URL publiques HTTP/HTTPS sont acceptées.');
    if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) throw new Error('Seuls les ports web standards sont autorisés.');
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata.google.internal') {
        throw new Error('Cette adresse n’est pas autorisée.');
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
        if (!isPublicIp(host)) throw new Error('Les adresses IP privées ne sont pas autorisées.');
        return url;
    }
    let records: string[] = [];
    for (const type of ['A', 'AAAA'] as const) {
        try {
            records.push(...await Deno.resolveDns(host, type));
        } catch {
            // A domain can have only A or only AAAA records.
        }
    }
    if (records.length === 0 || records.some((record) => !isPublicIp(record))) throw new Error('L’adresse ne pointe pas vers un serveur public autorisé.');
    return url;
}

async function fetchLimitedPage(start: URL) {
    let current = start;
    const deadline = Date.now() + 15_000;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
        await validatePublicUrl(current.href);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Le délai d’analyse est dépassé.');
        const response = await fetch(current, {
            redirect: 'manual',
            signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
            headers: { 'User-Agent': 'WichlistProductMetadata/1.0 (+public product metadata only)', Accept: 'text/html,application/xhtml+xml' }
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location || redirectCount === MAX_REDIRECTS) throw new Error('Trop de redirections ou redirection invalide.');
            current = new URL(location, current);
            continue;
        }
        if (!response.ok) throw new Error(`Le site a répondu avec le statut ${response.status}.`);
        if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw new Error('La page ne contient pas de document HTML.');
        const declaredLength = Number(response.headers.get('content-length'));
        if (declaredLength > MAX_BYTES) throw new Error('La page est trop volumineuse pour être analysée.');
        if (!response.body) throw new Error('Réponse vide du site marchand.');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BYTES) {
                await reader.cancel();
                throw new Error('La page est trop volumineuse pour être analysée.');
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return { html: new TextDecoder().decode(bytes), finalUrl: current.href };
    }
    throw new Error('Impossible de suivre la redirection.');
}

function decodeHtml(value: string) {
    return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function attributes(tag: string) {
    const result: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
    }
    return result;
}

function productFromJson(value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
        for (const entry of value) { const found = productFromJson(entry); if (found) return found; }
        return null;
    }
    if (!value || typeof value !== 'object') return null;
    const object = value as Record<string, unknown>;
    const type = object['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((entry) => typeof entry === 'string' && /(?:^|[\/#])Product$/i.test(entry)) && object.name) return object;
    return productFromJson(object['@graph']) || productFromJson(object.mainEntity) || productFromJson(object.itemListElement);
}

function extractMetadata(html: string, finalUrl: string) {
    const meta: Record<string, string> = {};
    for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
        const attrs = attributes(match[0]);
        const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
        if (key && attrs.content && !meta[key]) meta[key] = attrs.content;
    }
    let structured: Record<string, unknown> | null = null;
    for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi)) {
        try { structured = productFromJson(JSON.parse(match[1])); if (structured) break; } catch { /* Ignore malformed third-party structured data. */ }
    }
    const offers = structured?.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    const priceSpecification = offer?.priceSpecification as Record<string, unknown> | undefined;
    const schemaPrice = offer?.price ?? offer?.lowPrice ?? priceSpecification?.price;
    const rawPrice = meta['product:price:amount'] || meta['og:price:amount'] || String(schemaPrice ?? '');
    const priceMatch = rawPrice.match(/[0-9]+(?:[.,][0-9]{1,2})?/);
    const price = priceMatch ? Number(priceMatch[0].replace(',', '.')) : null;
    const schemaImage = structured?.image;
    const schemaImageValue = Array.isArray(schemaImage) ? schemaImage[0] : schemaImage;
    const schemaImageUrl = typeof schemaImageValue === 'string'
        ? schemaImageValue
        : typeof schemaImageValue === 'object' && schemaImageValue !== null
            ? String((schemaImageValue as Record<string, unknown>).url || '')
            : '';
    const rawImage = meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || schemaImageUrl;
    const imageUrl = rawImage ? new URL(rawImage, finalUrl).href : null;
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const title = (meta['og:title'] || meta['twitter:title'] || String(structured?.name || '') || (titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')).trim() : '')).slice(0, 180);
    const currency = (meta['product:price:currency'] || meta['og:price:currency'] || String(offer?.priceCurrency || 'EUR')).toUpperCase().slice(0, 3);
    return { title, imageUrl, price, currency };
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405);
    try {
        const declaredBodyLength = Number(request.headers.get('content-length'));
        if (declaredBodyLength > 4096) return jsonResponse({ error: 'Requête trop volumineuse.' }, 413);
        const body = await request.json();
        if (typeof body.url !== 'string' || body.url.length > 2048) return jsonResponse({ error: 'URL manquante ou trop longue.' }, 400);
        const startUrl = await validatePublicUrl(body.url);
        const { html, finalUrl } = await fetchLimitedPage(startUrl);
        const product = extractMetadata(html, finalUrl);
        const warnings: string[] = [];
        if (!product.title) warnings.push('Titre non trouvé.');
        if (product.price === null) warnings.push('Prix non trouvé.');
        if (product.price !== null && !product.currency) warnings.push('Devise non trouvée.');
        if (product.imageUrl) {
            try { await validatePublicUrl(product.imageUrl); }
            catch { product.imageUrl = null; warnings.push('Image ignorée car son adresse n’est pas publique.'); }
        } else warnings.push('Image non trouvée.');
        return jsonResponse({ ...product, product_url: finalUrl, price_checked_at: product.price ? new Date().toISOString() : null, warnings });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Analyse indisponible.';
        return jsonResponse({ error: message }, 422);
    }
});