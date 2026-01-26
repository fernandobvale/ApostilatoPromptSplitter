import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface User {
  id: string;
  email: string;
  role: 'admin' | 'designer' | 'assistant';
  created_at?: string;
}

export interface Course {
  id: string;
  user_id: string;
  title: string;
  created_at?: string;
}

export interface Lesson {
  id: string;
  course_id: string;
  original_content: string | null;
  edited_content: string | null;
  prompt: string | null;
  lesson_order: number;
  created_at?: string;
}

export interface PromptTemplate {
  id: string;
  user_id: string | null;
  template_type: 'first' | 'middle' | 'last';
  template: string;
  created_at?: string;
}
