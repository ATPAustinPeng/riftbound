import { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Profile, DEFAULT_COLLECTION_GOAL, isValidCollectionGoal, type CollectionGoal } from '@/lib/types';

import { supabase } from './supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setCollectionGoal: (goal: CollectionGoal) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, collection_goal, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to fetch profile:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    ...data,
    collection_goal: isValidCollectionGoal(data.collection_goal)
      ? data.collection_goal
      : DEFAULT_COLLECTION_GOAL,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    const nextProfile = await fetchProfile(userId);
    setProfile(nextProfile);
  }, [session?.user?.id]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }

    void refreshProfile();
  }, [session?.user?.id, refreshProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  }, []);

  const setCollectionGoal = useCallback(
    async (goal: CollectionGoal) => {
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not signed in');

      setProfile((current) =>
        current ? { ...current, collection_goal: goal } : current,
      );

      const { error } = await supabase
        .from('profiles')
        .update({ collection_goal: goal })
        .eq('id', userId);

      if (error) {
        await refreshProfile();
        throw error;
      }
    },
    [session?.user?.id, refreshProfile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      signOut,
      refreshProfile,
      setCollectionGoal,
    }),
    [session, profile, isLoading, signOut, refreshProfile, setCollectionGoal],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
