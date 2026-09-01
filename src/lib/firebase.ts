import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Initialize Firebase
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

// Data types
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
  id?: string;
  user_id: string | null;
  template_type: 'first' | 'middle' | 'last';
  template: string;
  created_at?: string;
}
