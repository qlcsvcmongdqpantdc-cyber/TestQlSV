import { createClient } from '@supabase/supabase-js';

// URL Supabase lấy từ dự án của bạn
const SUPABASE_URL = 'https://hmgiocksfiecyicvedwm.supabase.co';

// LƯU Ý: Thay chuỗi dưới đây bằng anon key trong Supabase Dashboard
// (Vào Supabase -> Project Settings -> API -> copy dòng 'anon / public')
const SUPABASE_ANON_KEY = 'sb_publishable_xfIIuGPcFKtT814ShPI5eg_jvjsIzsw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);