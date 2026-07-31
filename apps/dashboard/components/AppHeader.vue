<script lang="ts" setup>
import { ref, computed, onMounted } from "vue";
import { useAuth } from "~/composables/useAuth";
import { Icon } from "@iconify/vue";

const { user, initialized, loading, ensureInitialized, logout } = useAuth();

const mobileMenuOpen = ref(false);
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

async function handleLogout() {
  if (isLoggingOut.value) return;
  isLoggingOut.value = true;
  try {
    await logout();
    mobileMenuOpen.value = false;
  } finally {
    isLoggingOut.value = false;
  }
}
</script>

<template>
  <header
    class="fixed top-0 left-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md"
  >
    <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
      <!-- Logo -->
      <NuxtLink class="flex items-center gap-3" to="/">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 font-black text-slate-950 shadow-lg shadow-cyan-500/20"
        >
          D
        </div>
        <div class="hidden sm:block">
          <p class="text-lg font-bold text-white">DevPilot</p>
          <p class="text-xs text-slate-500">Self‑hosted deployments</p>
        </div>
      </NuxtLink>

      <!-- Desktop Right Side -->
      <div class="hidden md:flex items-center gap-4">
        <div
          v-if="loading || !initialized"
          class="flex items-center gap-3 text-sm text-slate-400"
        >
          <span
            class="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400"
          />
          Loading…
        </div>
        <template v-else-if="user">
          <div class="flex items-center gap-3">
            <img
              v-if="user.avatarUrl"
              :alt="userDisplayName"
              :src="user.avatarUrl"
              class="h-10 w-10 rounded-full border border-slate-700 object-cover"
            />
            <div
              v-else
              class="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400 font-bold text-slate-950"
            >
              {{ userInitial }}
            </div>
            <div class="max-w-40 hidden lg:block">
              <p class="truncate text-sm font-semibold text-white">
                {{ userDisplayName }}
              </p>
              <p class="truncate text-xs text-slate-500">
                @{{ user.username }}
              </p>
            </div>
          </div>
          <div
            class="hidden lg:block rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs text-slate-400 backdrop-blur"
          >
            Local
          </div>
          <button
            :disabled="isLoggingOut"
            class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
            @click="handleLogout"
          >
            <Icon v-if="!isLoggingOut" class="h-4 w-4" icon="mdi:logout" />
            <span
              v-else
              class="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-white"
            />
            <span class="hidden sm:inline">{{
              isLoggingOut ? "Logging out…" : "Logout"
            }}</span>
          </button>
        </template>
        <NuxtLink
          v-else
          class="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          to="/login"
        >
          Sign in
        </NuxtLink>
      </div>

      <!-- Mobile Hamburger -->
      <button
        aria-label="Toggle menu"
        class="md:hidden flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <Icon v-if="!mobileMenuOpen" class="h-6 w-6" icon="mdi:menu" />
        <Icon v-else class="h-6 w-6" icon="mdi:close" />
      </button>
    </div>

    <!-- Mobile Menu Overlay (v-motion slide) -->
    <div
      v-if="mobileMenuOpen"
      v-motion
      :enter="{ opacity: 1, y: 0 }"
      :initial="{ opacity: 0, y: -20 }"
      :leave="{ opacity: 0, y: -20 }"
      class="md:hidden absolute left-0 top-full w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur-lg px-6 py-5 shadow-2xl"
    >
      <div
        v-if="loading || !initialized"
        class="flex items-center gap-3 text-sm text-slate-400"
      >
        <span
          class="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400"
        />
        Loading…
      </div>
      <template v-else-if="user">
        <div class="flex items-center gap-4">
          <img
            v-if="user.avatarUrl"
            :alt="userDisplayName"
            :src="user.avatarUrl"
            class="h-12 w-12 rounded-full border border-slate-700 object-cover"
          />
          <div
            v-else
            class="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400 text-xl font-bold text-slate-950"
          >
            {{ userInitial }}
          </div>
          <div>
            <p class="text-base font-semibold text-white">
              {{ userDisplayName }}
            </p>
            <p class="text-sm text-slate-500">@{{ user.username }}</p>
          </div>
        </div>
        <div class="mt-4 flex items-center gap-3">
          <span
            class="rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs text-slate-400"
            >Local</span
          >
          <button
            :disabled="isLoggingOut"
            class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
            @click="handleLogout"
          >
            <Icon v-if="!isLoggingOut" class="h-4 w-4" icon="mdi:logout" />
            <span
              v-else
              class="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-white"
            />
            {{ isLoggingOut ? "Logging out…" : "Logout" }}
          </button>
        </div>
      </template>
      <NuxtLink
        v-else
        class="block rounded-lg bg-cyan-400 px-4 py-2 text-center text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        to="/login"
      >
        Sign in
      </NuxtLink>
    </div>
  </header>
</template>
