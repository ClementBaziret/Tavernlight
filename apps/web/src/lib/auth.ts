import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthResponse, LoginInput, RegisterInput, UserDto } from "@tavernlight/shared";
import { api, ApiError } from "./api";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<UserDto>("/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useAuthActions() {
  const client = useQueryClient();
  return {
    login: async (input: LoginInput) => {
      const r = await api.post<AuthResponse>("/auth/login", input);
      client.setQueryData(["me"], r.user);
      return r.user;
    },
    register: async (input: RegisterInput) => {
      const r = await api.post<AuthResponse>("/auth/register", input);
      client.setQueryData(["me"], r.user);
      return r.user;
    },
    logout: async () => {
      await api.post("/auth/logout");
      client.clear();
      client.setQueryData(["me"], null);
    },
  };
}
