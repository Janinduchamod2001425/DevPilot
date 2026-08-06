<script lang="ts" setup>
import { Icon } from "@iconify/vue";
import type { GitHubRepository, RootDirectoryCandidate } from "~/types/api";
import { useAppToast } from "~/composables/useAppToast";

const route = useRoute();
const api = useDevPilotApi();
const toast = useAppToast();

const repository = ref<GitHubRepository | null>(null);
const rootDirectories = ref<RootDirectoryCandidate[]>([]);
const selectedRootDirectory = ref("");
const recommendedRootDirectory = ref("");
const treeTruncated = ref(false);
const loading = ref(true);
const importing = ref(false);
const errorMessage = ref("");

const selectedCandidate = computed(() => {
  return (
    rootDirectories.value.find(
      (candidate) => candidate.rootDirectory === selectedRootDirectory.value,
    ) ?? null
  );
});

const canImport = computed(() => {
  return Boolean(
    repository.value &&
      hasValidSelection.value &&
      selectedCandidate.value?.deployable &&
      !loading.value &&
      !importing.value,
  );
});

const installationId = computed(() => {
  const value = route.query.installationId;
  return typeof value === "string" ? value : "";
});

const repositoryId = computed(() => {
  const value = route.query.repositoryId;
  return typeof value === "string" ? value : "";
});

const hasValidSelection = computed(
  () => Boolean(installationId.value) && Boolean(repositoryId.value),
);

function getRequestError(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data
  ) {
    const message = error.data.message;

    if (typeof message === "string") {
      return message;
    }

    if (Array.isArray(message)) {
      return message.filter((item) => typeof item === "string").join(", ");
    }
  }

  return fallback;
}

async function loadRepository(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";

  if (!hasValidSelection.value) {
    errorMessage.value =
      "The GitHub installation or repository selection is missing.";
    loading.value = false;
    return;
  }

  try {
    const [repositoriesResult, rootResult] = await Promise.all([
      api.getGitHubRepositories(installationId.value),
      api.getRepositoryRootDirectories(
        installationId.value,
        repositoryId.value,
      ),
    ]);

    repository.value =
      repositoriesResult.repositories.find(
        (item) => String(item.id) === repositoryId.value,
      ) ?? null;

    if (!repository.value) {
      throw new Error(
        "This repository is no longer available through the selected GitHub account.",
      );
    }

    rootDirectories.value = rootResult.candidates;
    recommendedRootDirectory.value = rootResult.recommendedRootDirectory;
    selectedRootDirectory.value = rootResult.recommendedRootDirectory;
    treeTruncated.value = rootResult.treeTruncated;
  } catch (error) {
    errorMessage.value = getRequestError(
      error,
      error instanceof Error
        ? error.message
        : "The selected repository could not be loaded.",
    );

    toast.error("Repository could not be loaded", errorMessage.value);
  } finally {
    loading.value = false;
  }
}

async function importProject(): Promise<void> {
  if (!canImport.value) {
    if (!selectedCandidate.value?.deployable) {
      toast.error(
        "Invalid root directory",
        "Select a directory containing a supported project.",
      );
    }

    return;
  }

  importing.value = true;
  errorMessage.value = "";

  const toastId = toast.loading("Importing repository...");

  try {
    const result = await api.importProject({
      installationId: installationId.value,
      repositoryId: repositoryId.value,
      rootDirectory: selectedRootDirectory.value,
    });

    toast.dismiss(toastId);

    if (result.deploymentWarning) {
      toast.warning("Project imported", result.deploymentWarning);
    } else {
      toast.success(
        "Project imported",
        "The first deployment has been added to the build queue.",
      );
    }

    await navigateTo(`/projects/${result.project.id}`);
  } catch (error) {
    errorMessage.value = getRequestError(
      error,
      "The repository could not be imported.",
    );

    toast.dismiss(toastId);
    toast.error("Import failed", errorMessage.value);
  } finally {
    importing.value = false;
  }
}

onMounted(() => {
  void loadRepository();
});
</script>

<template>
  <main class="px-6 py-10">
    <div class="mx-auto max-w-7xl">
      <NuxtLink
        class="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        to="/new"
      >
        <Icon class="h-4 w-4" icon="mdi:arrow-left" />
        Back to repositories
      </NuxtLink>

      <header class="mt-7">
        <p
          class="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400"
        >
          Configure project
        </p>
        <h1 class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Review your import
        </h1>
        <p class="mt-4 max-w-2xl text-slate-400">
          Confirm the repository and production defaults. DevPilot will create
          the project and immediately queue its first deployment.
        </p>
      </header>

      <section v-if="loading" class="mt-10 space-y-5">
        <div
          class="h-44 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60"
        />
        <div
          class="h-28 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60"
        />
      </section>

      <section
        v-else-if="errorMessage || !repository"
        class="mt-10 rounded-3xl border border-red-500/30 bg-red-500/10 px-6 py-12 text-center"
      >
        <div
          class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300"
        >
          <Icon class="h-7 w-7" icon="mdi:alert-circle-outline" />
        </div>
        <h2 class="mt-5 text-xl font-bold">Repository unavailable</h2>
        <p class="mx-auto mt-2 max-w-lg text-sm text-slate-400">
          {{ errorMessage }}
        </p>
        <NuxtLink
          class="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold transition hover:border-cyan-500 hover:text-cyan-300"
          to="/new"
        >
          Choose another repository
        </NuxtLink>
      </section>

      <template v-else>
        <section
          class="mt-10 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60"
        >
          <div class="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <div
              class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-slate-200"
            >
              <Icon class="h-7 w-7" icon="mdi:github" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-3">
                <h2 class="truncate text-xl font-bold">
                  {{ repository.fullName }}
                </h2>
                <span
                  class="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-400"
                >
                  {{ repository.private ? "Private" : "Public" }}
                </span>
              </div>
              <p class="mt-2 text-sm text-slate-400">
                Owned by {{ repository.owner.login }}
              </p>
            </div>

            <a
              :href="repository.htmlUrl"
              class="inline-flex items-center gap-2 text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
              rel="noopener noreferrer"
              target="_blank"
            >
              View on GitHub
              <Icon class="h-4 w-4" icon="mdi:open-in-new" />
            </a>
          </div>

          <dl
            class="grid gap-px border-t border-slate-800 bg-slate-800 sm:grid-cols-2"
          >
            <div class="bg-slate-950/60 p-5">
              <dt
                class="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Project name
              </dt>
              <dd class="mt-2 font-semibold text-slate-200">
                {{ repository.name }}
              </dd>
            </div>
            <div class="bg-slate-950/60 p-5">
              <dt
                class="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Production branch
              </dt>
              <dd
                class="mt-2 flex items-center gap-2 font-semibold text-slate-200"
              >
                <Icon class="h-4 w-4 text-slate-500" icon="mdi:source-branch" />
                {{ repository.defaultBranch }}
              </dd>
            </div>
            <div class="bg-slate-950/60 p-5 sm:col-span-2">
              <dt
                class="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Root directory
              </dt>

              <dd class="mt-3">
                <select
                  v-model="selectedRootDirectory"
                  class="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-sm text-slate-200 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                >
                  <option
                    v-for="candidate in rootDirectories"
                    :key="candidate.rootDirectory"
                    :value="candidate.rootDirectory"
                  >
                    {{
                      candidate.rootDirectory === "."
                        ? "./ — Repository root"
                        : `./${candidate.rootDirectory}`
                    }}
                    {{
                      candidate.rootDirectory === recommendedRootDirectory
                        ? " — Recommended"
                        : ""
                    }}
                    {{ !candidate.deployable ? " — No project detected" : "" }}
                  </option>
                </select>

                <div
                  v-if="selectedCandidate"
                  :class="
                    selectedCandidate.deployable
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                  "
                  class="mt-3 rounded-xl border px-4 py-3 text-sm"
                >
                  <div class="flex items-start gap-3">
                    <Icon
                      :icon="
                        selectedCandidate.deployable
                          ? 'mdi:check-circle-outline'
                          : 'mdi:alert-outline'
                      "
                      class="mt-0.5 h-5 w-5 shrink-0"
                    />

                    <div>
                      <p class="font-semibold">
                        {{
                          selectedCandidate.deployable
                            ? "Deployable project detected"
                            : "No supported project detected"
                        }}
                      </p>

                      <p
                        v-if="selectedCandidate.deployable"
                        class="mt-1 opacity-80"
                      >
                        Framework:
                        {{ selectedCandidate.framework ?? "Unknown" }}
                        · Package manager:
                        {{ selectedCandidate.packageManager ?? "Unknown" }}
                      </p>

                      <p
                        v-if="selectedCandidate.markers.length"
                        class="mt-1 font-mono text-xs opacity-70"
                      >
                        {{ selectedCandidate.markers.join(", ") }}
                      </p>

                      <p
                        v-if="!selectedCandidate.deployable"
                        class="mt-1 opacity-80"
                      >
                        Choose another directory before importing this project.
                      </p>
                    </div>
                  </div>
                </div>

                <p v-if="treeTruncated" class="mt-3 text-xs text-amber-300">
                  GitHub returned a truncated repository tree. Some deeply
                  nested directories may not be displayed.
                </p>
              </dd>
            </div>
            <div class="bg-slate-950/60 p-5">
              <dt
                class="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                First deployment
              </dt>
              <dd class="mt-2 font-semibold text-slate-200">
                Starts automatically
              </dd>
            </div>
          </dl>
        </section>

        <section
          class="mt-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/40 p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 class="font-semibold">Ready to deploy?</h2>
            <p class="mt-1 text-sm text-slate-500">
              Framework and build settings will be detected from the repository.
            </p>
          </div>

          <button
            :disabled="importing"
            class="inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            @click="importProject"
          >
            <Icon
              :class="{ 'animate-spin': importing }"
              :icon="importing ? 'mdi:loading' : 'mdi:rocket-launch-outline'"
              class="h-5 w-5"
            />
            {{
              importing
                ? "Importing..."
                : selectedCandidate?.deployable
                  ? "Import & deploy"
                  : "Select a valid directory"
            }}
          </button>
        </section>

        <p
          v-if="errorMessage"
          class="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {{ errorMessage }}
        </p>
      </template>
    </div>
  </main>
</template>
