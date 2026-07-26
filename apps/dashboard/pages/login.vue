<script lang="ts" setup>
import { useAuth } from "~/composables/useAuth";
definePageMeta({
  layout: false,
});

const route = useRoute();
const { isAuthenticated, initialized, loading, ensureInitialized, login } =
  useAuth();

const errorMessage = computed(() => {
  return typeof route.query.error === "string" ? route.query.error : null;
});

const returnTo = computed(() => {
  const redirect = route.query.redirect;

  if (
    typeof redirect === "string" &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//") &&
    redirect !== "/login"
  ) {
    return redirect;
  }

  return "/";
});

onMounted(async () => {
  await ensureInitialized();

  if (isAuthenticated.value) {
    await navigateTo(returnTo.value, {
      replace: true,
    });
  }
});

function continueWithGitHub() {
  login(returnTo.value);
}

const sessionExpired = computed(() => {
  return route.query.expired === "true";
});
</script>

<template>
  <main
    class="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white"
  >
    <section
      class="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl"
    >
      <div
        class="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold"
      >
        D
      </div>

      <h1 class="text-3xl font-bold">Deploy your projects with DevPilot</h1>

      <p class="mt-3 text-sm leading-6 text-slate-400">
        Sign in with GitHub to connect repositories, create deployments, monitor
        build logs, and manage your running applications.
      </p>

      <div
        v-if="errorMessage"
        class="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
      >
        {{ errorMessage }}
      </div>

      <div
        v-if="sessionExpired"
        class="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-200"
      >
        Your DevPilot session has expired. Please sign in again to continue.
      </div>

      <button
        :disabled="loading || !initialized"
        class="mt-7 flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        @click="continueWithGitHub"
      >
        <span
          v-if="loading || !initialized"
          class="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-slate-950"
        />

        <svg
          v-else
          aria-hidden="true"
          class="h-5 w-5"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.41-1.27.74-1.56-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.47.11-3.06 0 0 .98-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.09c.98 0 1.94.13 2.85.38 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.75.81 1.2 1.84 1.2 3.1 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.26c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"
          />
        </svg>

        Continue with GitHub
      </button>
      <p class="mt-5 text-center text-xs leading-5 text-slate-500">
        DevPilot uses your GitHub account to identify you and provide access to
        your own projects and deployments.
      </p>
    </section>
  </main>
</template>
