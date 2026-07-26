import { useAuth } from "~/composables/useAuth";

export default defineNuxtRouteMiddleware(async (to) => {
  const publicRoutes = ["/login"];

  if (publicRoutes.includes(to.path)) {
    return;
  }

  const { isAuthenticated, ensureInitialized } = useAuth();

  /*
   * Do not skip the server.
   *
   * Waiting here prevents private dashboard content from rendering
   * before authentication has been checked.
   */
  await ensureInitialized();

  if (!isAuthenticated.value) {
    return navigateTo(
      {
        path: "/login",
        query: {
          redirect: to.fullPath,
        },
      },
      {
        replace: true,
      },
    );
  }
});
