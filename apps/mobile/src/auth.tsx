import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthResponse, UserDto } from "@tavernlight/shared";
import { api, loadToken, saveToken } from "./api";

interface AuthState {
  user: UserDto | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        if (await loadToken()) setUser(await api.get<UserDto>("/auth/me"));
      } catch {
        await saveToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.post<AuthResponse>("/auth/login", { email, password });
    await saveToken(r.token);
    setUser(r.user);
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      await saveToken(null);
      setUser(null);
    }
  };
  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
