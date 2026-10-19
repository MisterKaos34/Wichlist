CREATE TABLE IF NOT EXISTS public.wishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
    product_url TEXT,
    image_url TEXT,
    price NUMERIC(12, 2) CHECK (price IS NULL OR price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    price_checked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wishes_user_created_idx ON public.wishes (user_id, created_at DESC);
ALTER TABLE public.wishes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own wishes" ON public.wishes;
CREATE POLICY "Users can select their own wishes" ON public.wishes
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert their own wishes" ON public.wishes;
CREATE POLICY "Users can insert their own wishes" ON public.wishes
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update their own wishes" ON public.wishes;
CREATE POLICY "Users can update their own wishes" ON public.wishes
    FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete their own wishes" ON public.wishes;
CREATE POLICY "Users can delete their own wishes" ON public.wishes
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wishes_updated_at ON public.wishes;
CREATE TRIGGER wishes_updated_at BEFORE UPDATE ON public.wishes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishes TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wish-images', 'wish-images', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Users can read their own wish images" ON storage.objects;
CREATE POLICY "Users can read their own wish images" ON storage.objects
    FOR SELECT TO authenticated USING (
        bucket_id = 'wish-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );
DROP POLICY IF EXISTS "Users can upload their own wish images" ON storage.objects;
CREATE POLICY "Users can upload their own wish images" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'wish-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );
DROP POLICY IF EXISTS "Users can update their own wish images" ON storage.objects;
CREATE POLICY "Users can update their own wish images" ON storage.objects
    FOR UPDATE TO authenticated USING (
        bucket_id = 'wish-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    ) WITH CHECK (
        bucket_id = 'wish-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );
DROP POLICY IF EXISTS "Users can delete their own wish images" ON storage.objects;
CREATE POLICY "Users can delete their own wish images" ON storage.objects
    FOR DELETE TO authenticated USING (
        bucket_id = 'wish-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

NOTIFY pgrst, 'reload schema';