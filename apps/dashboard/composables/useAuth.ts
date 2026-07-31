import type { AuthenticatedUser } from "~/types/api";

export function useAuth() {
  const user = useState<AuthenticatedUser | null>("auth-user", () => null);

  const initialized = useState<boolean>("auth-initialized", () => false);

  const loading = useState<boolean>("auth-loading", () => false);

  const isAuthenticated = computed(() => user.value !== null);

  async function fetchCurrentUser(): Promise<AuthenticatedUser | null> {
    if (loading.value) {
      return user.value;
    }

    loading.value = true;

    try {
      const { getCurrentUser } = useDevPilotApi();
      const response = await getCurrentUser();

      user.value = response.authenticated ? response.user : null;

      return user.value;
    } catch {
      user.value = null;
      return null;
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }

  async function ensureInitialized(): Promise<void> {
    if (!initialized.value) {
      await fetchCurrentUser();
    }
  }

  function login(returnTo = "/"): void {
    const { loginWithGitHub } = useDevPilotApi();
    loginWithGitHub(returnTo);
  }

  async function logout(): Promise<void> {
    const { logout: requestLogout } = useDevPilotApi();
    const toast = useAppToast();

    try {
      await requestLogout();

      user.value = null;
      initialized.value = true;

      await navigateTo("/login");

      toast.success(
        "Logged out successfully",
        "Your DevPilot session has ended.",
      );
    } catch (error) {
      console.error("Logout failed:", error);

      toast.error(
        "Logout failed",
        "Your session could not be ended. Please try again.",
      );

      throw error;
    }
  }

  function clearAuth(): void {
    user.value = null;
    initialized.value = true;
  }

  return {
    user: readonly(user),
    initialized: readonly(initialized),
    loading: readonly(loading),
    isAuthenticated,
    fetchCurrentUser,
    ensureInitialized,
    login,
    logout,
    clearAuth,
  };
}
