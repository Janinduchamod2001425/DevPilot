<script lang="ts" setup>
import { ref } from "vue";
import { useAuth } from "~/composables/useAuth";

const { user, initialized, loading, ensureInitialized, logout } = useAuth();

const isLoggingOut = ref(false);

const userDisplayName = computed(() => {
  return user.value?.displayName || user.value?.username || "GitHub User";
});

const userInitial = computed(() => {
  return userDisplayName.value.charAt(0).toUpperCase();
});

onMounted(async () => {
  await ensureInitialized();
});

async function handleLogout(): Promise<void> {
  if (isLoggingOut.value) {
    return;
  }

  isLoggingOut.value = true;

  try {
    await logout();
  } finally {
    isLoggingOut.value = false;
  }
}
</script>

<template>
  <header class="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
    <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
      <!-- DevPilot Logo -->
      <NuxtLink class="flex items-center gap-3" to="/">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 font-black text-slate-950"
        >
          D
        </div>

        <div>
          <p class="text-lg font-bold text-white">DevPilot</p>
          <p class="text-xs text-slate-500">Self-hosted deployments</p>
        </div>
      </NuxtLink>

      <!-- Loading State -->
      <div
        v-if="loading || !initialized"
        class="flex items-center gap-3 text-sm text-slate-400"
      >
        <span
          class="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400"
        />
        Loading account...
      </div>

      <!-- Authenticated User -->
      <div v-else-if="user" class="flex items-center gap-4">
        <div class="hidden items-center gap-3 sm:flex">
          <!-- GitHub Avatar -->
          <img
            v-if="user.avatarUrl"
            :alt="`${userDisplayName} avatar`"
            :src="user.avatarUrl"
            class="h-10 w-10 rounded-full border border-slate-700 object-cover"
          />

          <!-- Avatar Fallback -->
          <div
            v-else
            class="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400 font-bold text-slate-950"
          >
            {{ userInitial }}
          </div>

          <div class="max-w-40">
            <p class="truncate text-sm font-semibold text-white">
              {{ userDisplayName }}
            </p>

            <p class="truncate text-xs text-slate-500">@{{ user.username }}</p>
          </div>
        </div>

        <!-- Environment Badge -->
        <div
          class="hidden rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 lg:block"
        >
          Local environment
        </div>

        <!-- Logout Button -->
        <button
          :disabled="isLoggingOut"
          class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          @click="handleLogout"
        >
          <span
            v-if="isLoggingOut"
            class="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-white"
          />

          <svg
            v-else
            aria-hidden="true"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              d="M10 17l5-5-5-5M15 12H3m9-9h6a3 3 0 013 3v12a3 3 0 01-3 3h-6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <span class="hidden sm:inline">
            {{ isLoggingOut ? "Logging out..." : "Logout" }}
          </span>
        </button>
      </div>

      <!-- Unauthenticated Fallback -->
      <NuxtLink
        v-else
        class="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        to="/login"
      >
        Sign in
      </NuxtLink>
    </div>
  </header>
</template>
