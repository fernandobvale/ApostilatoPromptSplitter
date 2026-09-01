import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    type User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { User } from '../lib/firebase';

interface AuthContextType {
    user: FirebaseUser | null;
    userProfile: User | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, role: User['role']) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [userProfile, setUserProfile] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                await fetchUserProfile(currentUser.uid, currentUser.email || '');
            } else {
                setUserProfile(null);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    async function fetchUserProfile(userId: string, email: string) {
        try {
            const userDocRef = doc(db, 'users', userId);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                setUserProfile(userDoc.data() as User);
            } else {
                // Default profile fallback
                const fallbackProfile: User = {
                    id: userId,
                    email,
                    role: 'designer',
                    created_at: new Date().toISOString()
                };
                setUserProfile(fallbackProfile);
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
        } finally {
            setLoading(false);
        }
    }

    async function signIn(email: string, password: string) {
        await signInWithEmailAndPassword(auth, email, password);
    }

    async function signUp(email: string, password: string, role: User['role']) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const createdUser = userCredential.user;

        const profile: User = {
            id: createdUser.uid,
            email: createdUser.email || email,
            role,
            created_at: new Date().toISOString(),
        };

        await setDoc(doc(db, 'users', createdUser.uid), profile);
        setUserProfile(profile);
    }

    async function signOut() {
        await firebaseSignOut(auth);
    }

    const value = {
        user,
        userProfile,
        loading,
        signIn,
        signUp,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
