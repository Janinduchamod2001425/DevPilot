<script lang="ts" setup>
import { Icon } from "@iconify/vue";
import type {
  GitHubInstallation,
  GitHubRepositoriesResponse,
  GitHubRepository,
} from "~/types/api";
import { useAppToast } from "~/composables/useAppToast";

type VisibilityFilter = "all" | "public" | "private";

const api = useDevPilotApi();
const toast = useAppToast();
const route = useRoute();

const installations = ref<GitHubInstallation[]>([]);
const selectedInstallationId = ref("");
const repositories = ref<GitHubRepository[]>([]);
const searchQuery = ref("");
const visibilityFilter = ref<VisibilityFilter>("all");
const loadingInstallations = ref(true);
const loadingRepositories = ref(false);
const repositoriesLoaded = ref(false);
const errorMessage = ref("");

const selectedInstallation = computed(
  () =>
    installations.value.find(
      (installation) => installation.id === selectedInstallationId.value,
    ) ?? null,
);

const activeInstallations = computed(() =>
  installations.value.filter((installation) => !installation.suspendedAt),
);

const filteredRepositories = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  return repositories.value.filter((repository) => {
    const matchesSearch =
      !query ||
      repository.name.toLowerCase().includes(query) ||
      repository.fullName.toLowerCase().includes(query) ||
      repository.owner.login.toLowerCase().includes(query);

    const matchesVisibility =
      visibilityFilter.value === "all" ||
      (visibilityFilter.value === "private" && repository.private) ||
      (visibilityFilter.value === "public" && !repository.private);

    return matchesSearch && matchesVisibility;
  });
});

function getRequestError(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message;
  }

  return fallback;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function connectGitHub(): void {
  api.installGitHubApp();
}

async function loadInstallations(showErrorToast = true): Promise<void> {
  loadingInstallations.value = true;
  errorMessage.value = "";

  try {
    installations.value = await api.getGitHubInstallations();

    const callbackInstallationId =
      typeof route.query.installationId === "string"
        ? route.query.installationId
        : "";

    const callbackInstallationIsActive = activeInstallations.value.some(
      (installation) => installation.id === callbackInstallationId,
    );

    const currentSelectionIsActive = activeInstallations.value.some(
      (installation) => installation.id === selectedInstallationId.value,
    );

    if (callbackInstallationIsActive) {
      selectedInstallationId.value = callbackInstallationId;
    } else if (!currentSelectionIsActive) {
      selectedInstallationId.value = activeInstallations.value[0]?.id ?? "";
    }

    if (selectedInstallationId.value) {
      await loadRepositories(selectedInstallationId.value);
    } else {
      repositories.value = [];
      repositoriesLoaded.value = true;
    }
  } catch (error) {
    errorMessage.value = getRequestError(
      error,
      "GitHub installations could not be loaded.",
    );

    if (showErrorToast) {
      toast.error("GitHub connection failed", errorMessage.value);
    }
  } finally {
    loadingInstallations.value = false;
  }
}

async function loadRepositories(
  installationId: string,
  showSuccessToast = false,
): Promise<void> {
  if (!installationId) return;

  loadingRepositories.value = true;
  repositoriesLoaded.value = false;
  errorMessage.value = "";

  try {
    const result: GitHubRepositoriesResponse =
      await api.getGitHubRepositories(installationId);

    repositories.value = result.repositories;
    repositoriesLoaded.value = true;

    if (showSuccessToast) {
      toast.success(
        "Repositories refreshed",
        `${repositories.value.length} repositor${
          repositories.value.length === 1 ? "y" : "ies"
        } loaded from GitHub.`,
      );
    }
  } catch (error) {
    repositories.value = [];
    repositoriesLoaded.value = true;
    errorMessage.value = getRequestError(
      error,
      "Repositories could not be loaded from GitHub.",
    );
    toast.error("Repositories could not be loaded", errorMessage.value);
  } finally {
    loadingRepositories.value = false;
  }
}

async function selectInstallation(installationId: string): Promise<void> {
  if (
    installationId === selectedInstallationId.value &&
    repositoriesLoaded.value
  ) {
    return;
  }

  selectedInstallationId.value = installationId;
  searchQuery.value = "";
  visibilityFilter.value = "all";
  await loadRepositories(installationId);
}

function importRepository(repository: GitHubRepository): void {
  void navigateTo({
    path: "/new/configure",
    query: {
      installationId: selectedInstallationId.value,
      repositoryId: repository.id,
    },
  });
}

onMounted(() => {
  void loadInstallations();
});
</script>

<template>
  <main class="px-6 py-10">
    <div class="mx-auto max-w-6xl">
      <section
        class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <NuxtLink
            class="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
            to="/"
          >
            <Icon class="h-4 w-4" icon="mdi:arrow-left" />
            Back to dashboard
          </NuxtLink>
          <p
            class="mt-7 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400"
          >
            New project
          </p>
          <h1 class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Import a Git repository
          </h1>
          <p class="mt-4 max-w-2xl text-slate-400">
            Select a repository connected through the DevPilot GitHub App. You
            can configure its build settings before the first deployment.
          </p>
        </div>

        <button
          class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold transition hover:border-cyan-500 hover:text-cyan-300"
          type="button"
          @click="connectGitHub"
        >
          <Icon class="h-5 w-5" icon="mdi:github" />
          Add GitHub account
        </button>
      </section>

      <section v-if="loadingInstallations" class="mt-10">
        <div
          class="h-20 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
        />
        <div class="mt-6 space-y-3">
          <div
            v-for="item in 4"
            :key="item"
            class="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
          />
        </div>
      </section>

      <section
        v-else-if="installations.length === 0"
        v-motion
        :enter="{ opacity: 1, y: 0 }"
        :initial="{ opacity: 0, y: 20 }"
        class="mt-10 rounded-3xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center"
      >
        <div
          class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-200"
        >
          <Icon class="h-8 w-8" icon="mdi:github" />
        </div>
        <h2 class="mt-6 text-2xl font-bold">Connect GitHub to continue</h2>
        <p class="mx-auto mt-3 max-w-lg text-slate-400">
          Install the DevPilot GitHub App and choose which repositories DevPilot
          may access.
        </p>
        <button
          class="mt-7 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-300"
          type="button"
          @click="connectGitHub"
        >
          <Icon class="h-5 w-5" icon="mdi:github" />
          Connect GitHub
        </button>
      </section>

      <template v-else>
        <section class="mt-10">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold">GitHub account</h2>
              <p class="mt-1 text-sm text-slate-500">
                Choose the account or organization that owns the repository.
              </p>
            </div>
          </div>

          <div class="mt-4 flex gap-3 overflow-x-auto pb-2">
            <button
              v-for="installation in installations"
              :key="installation.id"
              :class="[
                installation.id === selectedInstallationId
                  ? 'border-cyan-400 bg-cyan-400/10 text-white'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700',
                installation.suspendedAt ? 'cursor-not-allowed opacity-50' : '',
              ]"
              :disabled="Boolean(installation.suspendedAt)"
              class="flex min-w-56 items-center gap-3 rounded-2xl border p-4 text-left transition"
              type="button"
              @click="selectInstallation(installation.id)"
            >
              <img
                v-if="installation.avatarUrl"
                :alt="`${installation.accountLogin} avatar`"
                :src="installation.avatarUrl"
                class="h-10 w-10 rounded-full bg-slate-800 object-cover"
              />
              <span
                v-else
                class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800"
              >
                <Icon class="h-5 w-5" icon="mdi:account" />
              </span>
              <span class="min-w-0">
                <span class="block truncate font-semibold">
                  {{ installation.accountLogin }}
                </span>
                <span class="mt-0.5 block text-xs text-slate-500">
                  {{
                    installation.suspendedAt
                      ? "Suspended"
                      : installation.accountType === "ORGANIZATION"
                        ? "Organization"
                        : "Personal account"
                  }}
                </span>
              </span>
            </button>
          </div>
        </section>

        <section
          v-if="selectedInstallation"
          class="mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60"
        >
          <div
            class="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="relative flex-1">
              <Icon
                class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
                icon="mdi:magnify"
              />
              <input
                v-model="searchQuery"
                class="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-500"
                placeholder="Search repositories..."
                type="search"
              />
            </div>

            <div class="flex items-center gap-2">
              <select
                v-model="visibilityFilter"
                aria-label="Repository visibility"
                class="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500"
              >
                <option value="all">All repositories</option>
                <option value="public">Public only</option>
                <option value="private">Private only</option>
              </select>
              <button
                :disabled="loadingRepositories"
                aria-label="Refresh repositories"
                class="rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
                type="button"
                @click="loadRepositories(selectedInstallationId, true)"
              >
                <Icon
                  :class="{ 'animate-spin': loadingRepositories }"
                  class="h-5 w-5"
                  icon="mdi:refresh"
                />
              </button>
            </div>
          </div>

          <div
            v-if="errorMessage"
            class="m-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200"
          >
            <div class="flex items-start gap-3">
              <Icon class="mt-0.5 h-5 w-5 shrink-0" icon="mdi:alert-circle" />
              <div>
                <p class="font-semibold">GitHub request failed</p>
                <p class="mt-1 text-sm text-rose-300">{{ errorMessage }}</p>
              </div>
            </div>
          </div>

          <div v-if="loadingRepositories" class="space-y-3 p-5">
            <div
              v-for="item in 5"
              :key="item"
              class="h-20 animate-pulse rounded-2xl bg-slate-800/70"
            />
          </div>

          <div
            v-else-if="repositoriesLoaded && repositories.length === 0"
            class="px-6 py-16 text-center"
          >
            <Icon
              class="mx-auto h-10 w-10 text-slate-600"
              icon="mdi:source-repository"
            />
            <h3 class="mt-4 text-lg font-semibold">
              No repositories available
            </h3>
            <p class="mt-2 text-sm text-slate-500">
              Update the GitHub App installation to grant access to a
              repository, then refresh this list.
            </p>
            <button
              class="mt-6 text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
              type="button"
              @click="connectGitHub"
            >
              Configure GitHub access
            </button>
          </div>

          <div
            v-else-if="filteredRepositories.length === 0"
            class="px-6 py-16 text-center"
          >
            <Icon
              class="mx-auto h-10 w-10 text-slate-600"
              icon="mdi:magnify-close"
            />
            <h3 class="mt-4 text-lg font-semibold">No matching repositories</h3>
            <p class="mt-2 text-sm text-slate-500">
              Try another search term or visibility filter.
            </p>
          </div>

          <div v-else class="divide-y divide-slate-800">
            <article
              v-for="repository in filteredRepositories"
              :key="repository.id"
              class="flex flex-col gap-4 p-5 transition hover:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="flex min-w-0 items-start gap-4">
                <div
                  class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
                >
                  <Icon class="h-5 w-5" icon="mdi:source-repository" />
                </div>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <a
                      :href="repository.htmlUrl"
                      class="truncate font-semibold transition hover:text-cyan-300"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {{ repository.fullName }}
                    </a>
                    <span
                      class="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-400"
                    >
                      {{ repository.private ? "Private" : "Public" }}
                    </span>
                  </div>
                  <div
                    class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"
                  >
                    <span class="inline-flex items-center gap-1">
                      <Icon class="h-3.5 w-3.5" icon="mdi:source-branch" />
                      {{ repository.defaultBranch }}
                    </span>
                    <span>
                      Connected {{ formatDate(selectedInstallation.updatedAt) }}
                    </span>
                  </div>
                </div>
              </div>

              <button
                class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
                type="button"
                @click="importRepository(repository)"
              >
                Import
                <Icon class="h-4 w-4" icon="mdi:arrow-right" />
              </button>
            </article>
          </div>
        </section>

        <section
          v-if="activeInstallations.length === 0"
          class="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200"
        >
          <p class="font-semibold">All GitHub installations are suspended</p>
          <p class="mt-1 text-sm text-amber-300">
            Restore an installation on GitHub or connect another account to
            import repositories.
          </p>
        </section>
      </template>
    </div>
  </main>
</template>
