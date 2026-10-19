const IMAGE_BUCKET = 'wish-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function fetchProducts() {
    const { data, error } = await window.supabaseClient
        .from('wishes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function getImageType(file) {
    if (!file || file.size > MAX_IMAGE_BYTES) throw new Error('L’image doit peser 5 Mo maximum.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (isJpeg) return { mime: 'image/jpeg', extension: 'jpg' };
    if (isPng) return { mime: 'image/png', extension: 'png' };
    if (isWebp) return { mime: 'image/webp', extension: 'webp' };
    throw new Error('Format non valide. Choisissez une image JPEG, PNG ou WebP.');
}

async function uploadProductImage(file, userId) {
    const type = await getImageType(file);
    const path = `${userId}/${crypto.randomUUID()}.${type.extension}`;
    const { error } = await window.supabaseClient.storage.from(IMAGE_BUCKET).upload(path, file, {
        contentType: type.mime,
        upsert: false
    });
    if (error) throw error;
    return path;
}

async function resolveImageUrl(imageRef) {
    if (!imageRef) return '';
    if (/^https?:\/\//i.test(imageRef)) return imageRef;
    const { data, error } = await window.supabaseClient.storage.from(IMAGE_BUCKET).createSignedUrl(imageRef, 3600);
    if (error) throw error;
    return data.signedUrl;
}

async function removeStoredImage(imageRef) {
    if (!imageRef || /^https?:\/\//i.test(imageRef)) return;
    const { error } = await window.supabaseClient.storage.from(IMAGE_BUCKET).remove([imageRef]);
    if (error) console.warn('Image non supprimée du stockage :', error.message);
}

async function addProduct(product) {
    const { data, error } = await window.supabaseClient.from('wishes').insert(product).select().single();
    if (error) throw error;
    return data;
}

async function updateProduct(productId, product, previousImage) {
    const { data, error } = await window.supabaseClient.from('wishes')
        .update(product).eq('id', productId).select().single();
    if (error) throw error;
    if (previousImage && previousImage !== product.image_url) await removeStoredImage(previousImage);
    return data;
}

async function deleteProduct(productId) {
    const { data, error } = await window.supabaseClient.from('wishes')
        .delete().eq('id', productId).select('image_url').single();
    if (error) throw error;
    await removeStoredImage(data.image_url);
}