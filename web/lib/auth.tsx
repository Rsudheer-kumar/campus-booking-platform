"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, type User, type UserRole, setStoredAccessToken } from "./api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session on mount
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        // Try silent refresh first
        const data = await api.auth.refresh();
        if (mounted && data.user) {
          setUser(data.user);
          setIsLoading(false);
          return;
        }
      } catch {
        // Fallback: in local dev, auto-login as student demo user
        try {
          const loginData = await api.auth.login(
            "student@campusflow.edu",
            "CampusFlow@2026!"
          );
          if (mounted && loginData.user) {
            setUser(loginData.user);
          }
        } catch {
          // Both failed, proceed as unauthenticated
          if (mounted) {
            setUser(null);
          }
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await api.auth.login(email, password);
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.auth.logout();
      setUser(null);
      setStoredAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Quick switch role between demo accounts for easy inspection and role testing
  const switchRole = useCallback(async (role: UserRole) => {
    setIsLoading(true);
    try {
      const emailMap: Record<string, string> = {
        STUDENT: "student@campusflow.edu",
        FACULTY: "faculty@campusflow.edu",
        ADMIN: "admin@campusflow.edu",
        FACILITY_MANAGER: "admin@campusflow.edu",
      };

      const email = emailMap[role] || "student@campusflow.edu";
      const data = await api.auth.login(email, "CampusFlow@2026!");
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
