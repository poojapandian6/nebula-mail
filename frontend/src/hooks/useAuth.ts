import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function useAuth() {
  const [user, setUser] = useState<{ id: string; email: string } | null | undefined>(undefined);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  return {
    user, // undefined = loading, null = logged out, object = logged in
    loading: user === undefined,
    logout: async () => {
      await api.logout();
      setUser(null);
    },
  };
}
