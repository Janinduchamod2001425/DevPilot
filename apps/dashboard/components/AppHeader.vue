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
  <header class="nav-header">
    <div class="nav-bar">
      <!-- Logo -->
      <NuxtLink aria-label="Go to DevPilot dashboard" class="nav-brand" to="/">
        <span class="nav-logo-ring">
          <img
            :src="'/images/devpilot-logo-transparent.png'"
            alt="DevPilot logo"
            class="nav-logo-img"
          />
        </span>

        <div class="nav-brand-copy">
          <p class="nav-brand-name">DevPilot</p>
          <p class="nav-brand-sub">Self-hosted deployments</p>
        </div>
      </NuxtLink>

      <!-- Desktop Right Side -->
      <div class="nav-desktop">
        <div v-if="loading || !initialized" class="nav-loading">
          <span class="nav-spinner" />
          Loading…
        </div>
        <template v-else-if="user">
          <div class="nav-user">
            <img
              v-if="user.avatarUrl"
              :alt="userDisplayName"
              :src="user.avatarUrl"
              class="nav-avatar"
            />
            <div v-else class="nav-avatar-fallback">
              {{ userInitial }}
            </div>
            <div class="nav-user-copy">
              <p class="nav-user-name">{{ userDisplayName }}</p>
              <p class="nav-user-handle">@{{ user.username }}</p>
            </div>
          </div>

          <button
            :disabled="isLoggingOut"
            class="nav-logout"
            type="button"
            @click="handleLogout"
          >
            <Icon v-if="!isLoggingOut" class="nav-icon" icon="mdi:logout" />
            <span v-else class="nav-spinner nav-spinner-light" />
            <span class="nav-logout-label">{{
              isLoggingOut ? "Logging out…" : "Logout"
            }}</span>
          </button>
        </template>
      </div>

      <!-- Mobile Hamburger -->
      <button
        aria-label="Toggle menu"
        class="nav-hamburger"
        type="button"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <Icon v-if="!mobileMenuOpen" class="nav-icon-lg" icon="mdi:menu" />
        <Icon v-else class="nav-icon-lg" icon="mdi:close" />
      </button>
    </div>

    <!-- Mobile Menu Overlay (v-motion slide) -->
    <div
      v-if="mobileMenuOpen"
      v-motion
      :enter="{ opacity: 1, y: 0 }"
      :initial="{ opacity: 0, y: -20 }"
      :leave="{ opacity: 0, y: -20 }"
      class="nav-mobile-menu"
    >
      <div v-if="loading || !initialized" class="nav-loading">
        <span class="nav-spinner" />
        Loading…
      </div>
      <template v-else-if="user">
        <div class="nav-mobile-user">
          <img
            v-if="user.avatarUrl"
            :alt="userDisplayName"
            :src="user.avatarUrl"
            class="nav-avatar nav-avatar-lg"
          />
          <div v-else class="nav-avatar-fallback nav-avatar-fallback-lg">
            {{ userInitial }}
          </div>
          <div>
            <p class="nav-mobile-name">{{ userDisplayName }}</p>
            <p class="nav-mobile-handle">@{{ user.username }}</p>
          </div>
        </div>
        <div class="nav-mobile-actions">
          <button
            :disabled="isLoggingOut"
            class="nav-logout nav-logout-block"
            type="button"
            @click="handleLogout"
          >
            <Icon v-if="!isLoggingOut" class="nav-icon" icon="mdi:logout" />
            <span v-else class="nav-spinner nav-spinner-light" />
            {{ isLoggingOut ? "Logging out…" : "Logout" }}
          </button>
        </div>
      </template>
    </div>
  </header>
</template>

<style scoped>
.nav-header {
  --bg: #020617;
  --surface: rgba(15, 23, 42, 0.7);
  --surface-2: rgba(30, 41, 59, 0.75);
  --border: #1e293b;
  --border-hover: #334155;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --text-faint: #64748b;
  --accent: #22d3ee;
  --accent-dim: rgba(34, 211, 238, 0.14);
  --bad: #fb7185;
  --bad-dim: rgba(251, 113, 133, 0.12);

  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  width: 100%;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(
    180deg,
    rgba(2, 6, 23, 0.92),
    rgba(2, 6, 23, 0.82)
  );
  backdrop-filter: blur(14px);
  box-shadow: 0 1px 0 rgba(34, 211, 238, 0.08);
  font-family:
    "Inter",
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.nav-bar {
  margin: 0 auto;
  display: flex;
  max-width: 84rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1.5rem;
}

/* Brand */
.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav-logo-ring {
  display: inline-flex;
  border-radius: 12px;
  padding: 2px;
  background: linear-gradient(
    135deg,
    rgba(34, 211, 238, 0.6),
    rgba(59, 130, 246, 0.15)
  );
  box-shadow: 0 0 20px -4px rgba(34, 211, 238, 0.45);
}

.nav-logo-img {
  height: 2.5rem;
  width: 2.5rem;
  border-radius: 10px;
  object-fit: contain;
  background: var(--bg);
  display: block;
}

.nav-brand-copy {
  display: none;
}

@media (min-width: 640px) {
  .nav-brand-copy {
    display: block;
  }
}

.nav-brand-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.01em;
}

.nav-brand-sub {
  margin-top: -2px;
  font-size: 0.72rem;
  color: var(--text-faint);
}

/* Desktop right side */
.nav-desktop {
  display: none;
  align-items: center;
  gap: 1rem;
}

@media (min-width: 768px) {
  .nav-desktop {
    display: flex;
  }
}

.nav-loading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.nav-spinner {
  height: 1.1rem;
  width: 1.1rem;
  border-radius: 999px;
  border: 2px solid rgba(34, 211, 238, 0.25);
  border-top-color: var(--accent);
  animation: nav-spin 0.7s linear infinite;
}

.nav-spinner-light {
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #ffffff;
  height: 1rem;
  width: 1rem;
}

@keyframes nav-spin {
  to {
    transform: rotate(360deg);
  }
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.nav-avatar {
  height: 2.35rem;
  width: 2.35rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  object-fit: cover;
}

.nav-avatar-fallback {
  display: flex;
  height: 2.35rem;
  width: 2.35rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--accent);
  color: #04121a;
  font-weight: 700;
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.4),
    0 0 16px -2px rgba(34, 211, 238, 0.5);
}

.nav-user-copy {
  display: none;
  max-width: 10rem;
}

@media (min-width: 1024px) {
  .nav-user-copy {
    display: block;
  }
}

.nav-user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
}

.nav-user-handle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  color: var(--text-faint);
}

.nav-logout {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-dim);
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.nav-logout:hover:not(:disabled) {
  border-color: rgba(251, 113, 133, 0.4);
  background: var(--bad-dim);
  color: #fca5b1;
}

.nav-logout:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.nav-logout-label {
  display: none;
}

@media (min-width: 640px) {
  .nav-logout-label {
    display: inline;
  }
}

.nav-icon {
  height: 1rem;
  width: 1rem;
}

.nav-icon-lg {
  height: 1.5rem;
  width: 1.5rem;
}

/* Hamburger */
.nav-hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 0.5rem;
  color: var(--text-dim);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.nav-hamburger:hover {
  background: var(--surface-2);
  color: var(--accent);
}

@media (min-width: 768px) {
  .nav-hamburger {
    display: none;
  }
}

/* Mobile menu */
.nav-mobile-menu {
  position: absolute;
  left: 0;
  top: 100%;
  width: 100%;
  border-bottom: 1px solid var(--border);
  background: rgba(2, 6, 23, 0.97);
  backdrop-filter: blur(16px);
  padding: 1.25rem 1.5rem;
  box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.6);
}

@media (min-width: 768px) {
  .nav-mobile-menu {
    display: none;
  }
}

.nav-mobile-user {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.nav-avatar-lg {
  height: 3rem;
  width: 3rem;
}

.nav-avatar-fallback-lg {
  height: 3rem;
  width: 3rem;
  font-size: 1.2rem;
}

.nav-mobile-name {
  font-size: 1rem;
  font-weight: 600;
  color: #ffffff;
}

.nav-mobile-handle {
  font-size: 0.85rem;
  color: var(--text-faint);
}

.nav-mobile-actions {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav-logout-block {
  width: 100%;
  justify-content: center;
}
</style>
