<script lang="ts" setup>
import { useAppToast } from "~/composables/useAppToast";
import { Icon } from "@iconify/vue";

definePageMeta({ layout: false });

const route = useRoute();
const { isAuthenticated, initialized, loading, ensureInitialized, login } =
  useAuth();
const toast = useAppToast();

const isRedirecting = ref(false);

const errorMessage = computed(() => {
  return typeof route.query.error === "string" ? route.query.error : null;
});

const sessionExpired = computed(() => route.query.expired === "true");

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
    await navigateTo(returnTo.value, { replace: true });
    return;
  }

  if (errorMessage.value) {
    toast.error(errorMessage.value);
  } else if (sessionExpired.value) {
    toast.warning("Your session has expired. Please sign in again.");
  }
});

async function continueWithGitHub() {
  if (isRedirecting.value) return;
  isRedirecting.value = true;
  try {
    await login(returnTo.value);
    // If login() resolves without navigating away (e.g. it just
    // returns a URL and something else redirects), isRedirecting stays
    // true since a navigation is imminent.
  } catch (err) {
    isRedirecting.value = false;
    console.error(err);
    toast.error(
      "GitHub sign-in failed",
      "Something went wrong while connecting to GitHub. Please try again.",
    );
  }
}
</script>

<template>
  <main
    class="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950 px-6 text-white"
  >
    <section
      v-motion
      :enter="{ opacity: 1, scale: 1 }"
      :initial="{ opacity: 0, scale: 0.95 }"
      class="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-sm"
    >
      <div
        class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-2xl font-bold text-slate-950 shadow-lg shadow-cyan-500/20"
      >
        D
      </div>
      <h1 class="text-3xl font-bold tracking-tight">Deploy with DevPilot</h1>
      <p class="mt-3 text-sm leading-6 text-slate-400">
        Sign in with GitHub to connect repositories, create deployments, and
        monitor your apps.
      </p>

      <div
        v-if="errorMessage"
        class="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
      >
        {{ errorMessage }}
      </div>
      <div
        v-if="sessionExpired"
        class="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"
      >
        Your session has expired. Please sign in again.
      </div>

      <button
        :disabled="loading || !initialized || isRedirecting"
        class="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        @click="continueWithGitHub"
      >
        <template v-if="loading || !initialized">
          <span
            class="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-slate-950"
          />
        </template>
        <template v-else-if="isRedirecting">
          <span
            class="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-slate-950"
          />
          Redirecting to GitHub…
        </template>
        <template v-else>
          <Icon class="h-5 w-5" icon="mdi:github" />
          Continue with GitHub
        </template>
      </button>
      <p class="mt-5 text-center text-xs text-slate-500">
        DevPilot uses GitHub to identify you and provide access to your
        projects.
      </p>
    </section>
  </main>
</template>
