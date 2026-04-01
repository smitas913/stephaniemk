import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "owner" | "admin" | "consultant" | "customer" | "staff";
type ConsultantStatus = "none" | "pending" | "approved" | "rejected";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  consultant_status: ConsultantStatus;
};

type AuthContext = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refetchProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContext>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileLoading: true,
  signOut: async () => {},
  refetchProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    setProfileLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data as Profile | null);
    setProfileLoading(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setProfileLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refetchProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, profileLoading, signOut, refetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
