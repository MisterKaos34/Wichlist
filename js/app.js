function showNotice(element, message, type = 'danger') {
    element.textContent = message;
    element.className = `alert alert-${type}`;
    element.hidden = false;
}

function formatPrice(price, currency) {
    if (price === null || price === undefined || price === '') return 'Prix non indiqué';
    try {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'EUR' }).format(Number(price));
    } catch {
        return `${price} ${currency || 'EUR'}`;
    }
}

async function renderWishlistTotal(products) {
    const summary = document.getElementById('wishlist-summary');
    const currencySelect = document.getElementById('wishlist-currency');
    const totalElement = document.getElementById('wishlist-total');
    const noteElement = summary.querySelector('.summary-note');
    const pricedProducts = products.filter((product) =>
        product.price !== null && product.price !== undefined && product.price !== '' && Number.isFinite(Number(product.price))
    );

    summary.hidden = pricedProducts.length === 0;
    if (summary.hidden) return;

    const currencies = Array.from(new Set(['EUR', 'USD', 'GBP', 'CAD', 'CHF', ...pricedProducts.map((product) => (product.currency || 'EUR').toUpperCase())]));
    currencySelect.replaceChildren();
    for (const currency of currencies) {
        const option = document.createElement('option');
        option.value = currency;
        option.textContent = currency;
        currencySelect.append(option);
    }

    const savedCurrency = localStorage.getItem('wishlist-total-currency');
    currencySelect.value = currencies.includes(savedCurrency)
        ? savedCurrency
        : (currencies.includes('EUR') ? 'EUR' : currencies[0]);

    currencySelect.disabled = true;
    totalElement.textContent = 'Chargement…';
    noteElement.textContent = 'Chargement des taux de conversion…';

    try {
        const response = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR', {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Taux indisponibles (HTTP ${response.status}).`);
        const exchangeData = await response.json();
        const rates = { EUR: 1, ...exchangeData.rates };
        if (!exchangeData.date || !exchangeData.rates) throw new Error('Réponse de taux invalide.');

        const updateTotal = () => {
            const targetCurrency = currencySelect.value;
            const targetRate = rates[targetCurrency];
            if (!targetRate) {
                totalElement.textContent = 'Indisponible';
                noteElement.textContent = `Aucun taux disponible pour ${targetCurrency}.`;
                return;
            }

            let total = 0;
            for (const product of pricedProducts) {
                const sourceCurrency = (product.currency || 'EUR').toUpperCase();
                const sourceRate = rates[sourceCurrency];
                if (!sourceRate) {
                    totalElement.textContent = 'Indisponible';
                    noteElement.textContent = `Conversion impossible : taux ${sourceCurrency} indisponible.`;
                    return;
                }
                total += (Number(product.price) / sourceRate) * targetRate;
            }

            totalElement.textContent = formatPrice(Math.round(total * 100) / 100, targetCurrency);
            const rateDate = new Date(`${exchangeData.date}T00:00:00Z`).toLocaleDateString('fr-FR');
            noteElement.textContent = `Converti au taux de référence du ${rateDate} (Frankfurter / BCE).`;
            localStorage.setItem('wishlist-total-currency', targetCurrency);
        };

        currencySelect.disabled = false;
        currencySelect.onchange = updateTotal;
        updateTotal();
    } catch {
        totalElement.textContent = 'Indisponible';
        noteElement.textContent = 'Taux de conversion indisponibles. Vérifiez votre connexion et rechargez la page.';
    }
}

async function renderWishlist(user) {
    const grid = document.getElementById('wishlist');
    const empty = document.getElementById('empty-message');
    const status = document.getElementById('page-message');
    grid.replaceChildren();
    showNotice(status, 'Chargement de votre wishlist…', 'info');
    try {
        const products = await fetchProducts();
        status.hidden = true;
        renderWishlistTotal(products);
        empty.hidden = products.length !== 0;
        for (const product of products) {
            const column = document.createElement('article');
            column.className = 'product-card';
            const image = document.createElement('img');
            image.className = 'product-image';
            image.alt = product.title;
            if (product.image_url) {
                try {
                    const imageUrl = await resolveImageUrl(product.image_url);
                    if (imageUrl) image.src = imageUrl;
                    else image.classList.add('image-empty');
                } catch {
                    image.classList.add('image-empty');
                }
            } else {
                image.classList.add('image-empty');
            }
            image.addEventListener('error', () => {
                image.removeAttribute('src');
                image.classList.add('image-empty');
            });
            const body = document.createElement('div');
            body.className = 'product-card-body';
            const title = document.createElement('h3');
            title.textContent = product.title;
            const price = document.createElement('p');
            price.className = 'product-price';
            price.textContent = formatPrice(product.price, product.currency);
            const actions = document.createElement('div');
            actions.className = 'product-actions';
            if (product.product_url) {
                try {
                    const safeUrl = new URL(product.product_url);
                    if (['http:', 'https:'].includes(safeUrl.protocol)) {
                        const link = document.createElement('a');
                        link.className = 'btn btn-outline-dark';
                        link.href = safeUrl.href;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.textContent = 'Voir le produit';
                        actions.append(link);
                    }
                } catch { /* Ignore malformed links from existing rows. */ }
            }
            const edit = document.createElement('a');
            edit.className = 'btn btn-light';
            edit.href = `edit-product.html?id=${encodeURIComponent(product.id)}`;
            edit.textContent = 'Modifier';
            actions.append(edit);
            const remove = document.createElement('button');
            remove.className = 'btn btn-outline-danger';
            remove.type = 'button';
            remove.textContent = 'Supprimer';
            remove.addEventListener('click', async () => {
                if (!window.confirm(`Supprimer « ${product.title} » ?`)) return;
                remove.disabled = true;
                try {
                    await deleteProduct(product.id);
                    await renderWishlist(user);
                } catch (error) {
                    showNotice(status, error.message || 'La suppression a échoué.');
                    remove.disabled = false;
                }
            });
            actions.append(remove);
            body.append(title, price, actions);
            column.append(image, body);
            grid.append(column);
        }
    } catch (error) {
        showNotice(status, error.message || 'Impossible de charger votre wishlist.');
    }
}

async function setupProductForm(user, isEdit) {
    const form = document.getElementById(isEdit ? 'edit-product-form' : 'add-product-form');
    const message = document.getElementById('form-message');
    const preview = document.getElementById('preview-image');
    const fileInput = document.getElementById('product-image');
    const removeImage = document.getElementById('remove-image');
    const analyzeButton = document.getElementById('analyze-link');
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    let currentProduct = null;
    let imageRef = null;

    if (isEdit) {
        if (!productId) return window.location.replace('index.html');
        const { data, error } = await window.supabaseClient.from('wishes').select('*').eq('id', productId).single();
        if (error) {
            showNotice(message, 'Ce souhait est introuvable ou vous ne pouvez pas le modifier.');
            return;
        }
        currentProduct = data;
        imageRef = data.image_url;
        form.elements.title.value = data.title;
        form.elements.product_url.value = data.product_url || '';
        form.elements.price.value = data.price ?? '';
        form.elements.currency.value = data.currency || 'EUR';
        if (imageRef) preview.src = await resolveImageUrl(imageRef).catch(() => '');
        document.getElementById('image-preview-wrap').hidden = !preview.src;
        if (data.price_checked_at) document.getElementById('price-note').textContent = `Prix relevé le ${new Date(data.price_checked_at).toLocaleDateString('fr-FR')}.`;
    }

    form.elements.price.addEventListener('input', () => {
        document.getElementById('price-note').dataset.checkedAt = '';
        document.getElementById('price-note').dataset.manuallyChanged = 'true';
        if (document.getElementById('price-note').textContent) document.getElementById('price-note').textContent = 'Prix modifié manuellement; il n’a pas été vérifié.';
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        preview.src = URL.createObjectURL(file);
        document.getElementById('image-preview-wrap').hidden = false;
        if (removeImage) removeImage.dataset.remove = 'false';
    });

    if (removeImage) removeImage.addEventListener('click', () => {
        imageRef = null;
        fileInput.value = '';
        preview.removeAttribute('src');
        document.getElementById('image-preview-wrap').hidden = true;
        removeImage.dataset.remove = 'true';
    });

    analyzeButton.addEventListener('click', async () => {
        const url = form.elements.product_url.value.trim();
        if (!url) return showNotice(message, 'Ajoutez un lien avant de lancer l’analyse.', 'warning');
        analyzeButton.disabled = true;
        analyzeButton.textContent = 'Analyse en cours…';
        try {
            const result = await analyzeProductUrl(url);
            if (result.title) form.elements.title.value = result.title;
            if (result.price !== null && result.price !== undefined && Number.isFinite(Number(result.price))) form.elements.price.value = result.price;
            if (result.currency) form.elements.currency.value = result.currency;
            if (result.imageUrl) {
                imageRef = result.imageUrl;
                preview.src = result.imageUrl;
                document.getElementById('image-preview-wrap').hidden = false;
            }
            document.getElementById('price-note').textContent = result.price_checked_at
                ? `Prix relevé le ${new Date(result.price_checked_at).toLocaleDateString('fr-FR')}.`
                : 'Analyse terminée. Vérifiez les informations avant l’enregistrement.';
            document.getElementById('price-note').dataset.checkedAt = result.price_checked_at || '';
            document.getElementById('price-note').dataset.manuallyChanged = 'false';
            if (result.product_url) form.elements.product_url.value = result.product_url;
            showNotice(message, result.warnings?.join(' ') || 'Analyse terminée. Vérifiez les informations avant l’enregistrement.', 'success');
        } catch (error) {
            showNotice(message, `${error.message} Vous pouvez compléter les champs manuellement.`, 'warning');
        } finally {
            analyzeButton.disabled = false;
            analyzeButton.textContent = 'Analyser le lien';
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('[type="submit"]');
        const originalButtonText = button.textContent;
        button.disabled = true;
        button.textContent = 'Enregistrement…';
        let uploadedImage = null;
        try {
            const rawUrl = form.elements.product_url.value.trim();
            if (rawUrl && !['http:', 'https:'].includes(new URL(rawUrl).protocol)) throw new Error('Le lien doit commencer par http:// ou https://.');
            let nextImage = imageRef;
            if (fileInput.files[0]) {
                uploadedImage = await uploadProductImage(fileInput.files[0], user.id);
                nextImage = uploadedImage;
            }
            const rawPrice = form.elements.price.value.trim();
            const product = {
                title: form.elements.title.value.trim(),
                product_url: rawUrl || null,
                image_url: removeImage?.dataset.remove === 'true' ? null : nextImage,
                price: rawPrice === '' ? null : Number(rawPrice),
                currency: form.elements.currency.value,
                price_checked_at: document.getElementById('price-note').dataset.manuallyChanged === 'true'
                    ? null
                    : (document.getElementById('price-note').dataset.checkedAt || (isEdit ? currentProduct.price_checked_at : null))
            };
            if (!product.title) throw new Error('Le titre est obligatoire.');
            if (rawPrice !== '' && (!Number.isFinite(product.price) || product.price < 0)) throw new Error('Saisissez un prix valide supérieur ou égal à zéro.');
            if (isEdit) await updateProduct(productId, product, currentProduct.image_url);
            else await addProduct(product);
            window.location.replace('index.html');
        } catch (error) {
            if (uploadedImage) await removeStoredImage(uploadedImage);
            showNotice(message, error.message || 'Enregistrement impossible.');
            button.disabled = false;
            button.textContent = originalButtonText;
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const protectedPage = document.body.dataset.protected === 'true';
    if (!protectedPage) return;
    const user = await requireAuthenticatedUser();
    if (!user) return;
    if (document.getElementById('wishlist')) await renderWishlist(user);
    if (document.getElementById('add-product-form')) await setupProductForm(user, false);
    if (document.getElementById('edit-product-form')) await setupProductForm(user, true);
});