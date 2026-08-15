import { createClient } from "@supabase/supabase-js";

// Chaves vêm de .env.local (dev, gerado por scripts/gen-env.mjs) ou do ambiente de deploy.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);
