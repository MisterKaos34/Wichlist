// Use only the public anon/publishable key here. Never put a service-role key in browser code.
const SUPABASE_URL = 'https://ethhnvxaoiekkgnsgfzx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hOXNelGmZpDUlAepqmnhaA_wCDqWceP';

const supabaseConfigured =
	!SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
	!SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_');

const supabaseClient = supabaseConfigured
	? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
	: null;

window.supabaseClient = supabaseClient;
window.supabaseConfigured = supabaseConfigured;