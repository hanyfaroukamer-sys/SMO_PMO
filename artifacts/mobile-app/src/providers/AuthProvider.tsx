import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";

WebBrowser.maybeCompleteAuthSession();

interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

interface AuthContextType {
  isLoading: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isSignedIn: false,
  user: null,
  signIn: async () => {},
  signOut: async () => {},
  accessToken: null,
});

const API_URL = Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:3000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("access_token");
        if (token) {
          const res = await fetch(`${API_URL}/api/auth/user`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            setAccessToken(token);
          } else {
            await SecureStore.deleteItemAsync("access_token");
          }
        }
      } catch {
        // Session restore failed silently
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = async () => {
    try {
      // Redirect to the web-based OIDC flow
      const redirectUri = AuthSession.makeRedirectUri({ scheme: "strategypmo" });
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_URL}/api/auth/login?redirect=${encodeURIComponent(redirectUri)}`,
        redirectUri
      );

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const token = url.searchParams.get("token");
        if (token) {
          await SecureStore.setItemAsync("access_token", token);
          setAccessToken(token);

          const res = await fetch(`${API_URL}/api/auth/user`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          }
        }
      }
    } catch (err) {
      console.error("Sign in failed:", err);
    }
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync("access_token");
    setUser(null);
    setAccessToken(null);
  };

  return (
    <AuthContext.Provider value={{ isLoading, isSignedIn: !!user, user, signIn, signOut, accessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
