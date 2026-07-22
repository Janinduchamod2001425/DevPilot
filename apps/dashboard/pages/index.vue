<script lang="ts" setup>
import type { Project } from "~/types/api";

const api = useDevPilotApi();

const projects = ref<Project[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const apiConnected = ref(false);

async function loadDashboard() {
  loading.value = true;
  errorMessage.value = "";

  const [healthResult, projectsResult] = await Promise.allSettled([
    api.getHealth(),
    api.getProjects(),
  ]);

  apiConnected.value = healthResult.status === "fulfilled";

  if (projectsResult.status === "fulfilled") {
    projects.value = projectsResult.value;
  } else {
    errorMessage.value =
      "Projects could not be loaded. Check whether the DevPilot API is running.";
  }

  loading.value = false;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

onMounted(loadDashboard);
</script>

<template>
  <main class="px-6 py-12">
    <div class="mx-auto max-w-7xl">
      <section
        class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p
            class="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400"
          >
            Deployment dashboard
          </p>

          <h1 class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Your projects
          </h1>

          <p class="mt-4 max-w-2xl text-slate-400">
            Deploy repositories, monitor build progress, and manage running
            applications from one place.
          </p>
        </div>

        <button
          :disabled="loading"
          class="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-500 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          @click="loadDashboard"
        >
          {{ loading ? "Refreshing..." : "Refresh" }}
        </button>
      </section>

      <section class="mt-10 grid gap-4 sm:grid-cols-3">
        <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p class="text-sm text-slate-500">API status</p>

          <p
            :class="apiConnected ? 'text-emerald-400' : 'text-rose-400'"
            class="mt-2 text-lg font-semibold"
          >
            {{ apiConnected ? "Connected" : "Offline" }}
          </p>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p class="text-sm text-slate-500">Projects</p>
          <p class="mt-2 text-2xl font-bold">
            {{ projects.length }}
          </p>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p class="text-sm text-slate-500">Running deployments</p>

          <p class="mt-2 text-2xl font-bold text-emerald-400">
            {{
              projects.filter(
                (project) => project.deployments[0]?.status === "READY",
              ).length
            }}
          </p>
        </div>
      </section>

      <div
        v-if="errorMessage"
        class="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200"
      >
        <p class="font-semibold">Dashboard request failed</p>
        <p class="mt-1 text-sm text-rose-300">
          {{ errorMessage }}
        </p>
      </div>

      <section class="mt-10">
        <div v-if="loading" class="grid gap-5 lg:grid-cols-2">
          <div
            v-for="item in 4"
            :key="item"
            class="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
          />
        </div>

        <div
          v-else-if="projects.length === 0 && !errorMessage"
          class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center"
        >
          <h2 class="text-xl font-semibold">No projects found</h2>

          <p class="mt-2 text-slate-400">
            Projects added to DevPilot will appear here.
          </p>
        </div>

        <div v-else class="grid gap-5 lg:grid-cols-2">
          <article
            v-for="project in projects"
            :key="project.id"
            class="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-slate-700 hover:bg-slate-900"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <NuxtLink
                  :to="`/projects/${project.id}`"
                  class="text-xl font-bold transition group-hover:text-cyan-300"
                >
                  {{ project.name }}
                </NuxtLink>

                <p class="mt-1 truncate text-sm text-slate-400">
                  {{ project.repositoryOwner }}/{{ project.repositoryName }}
                </p>
              </div>

              <StatusBadge :status="project.deployments[0]?.status" />
            </div>

            <div
              class="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm"
            >
              <div>
                <p class="text-slate-500">Branch</p>
                <p class="mt-1 font-medium text-slate-200">
                  {{ project.productionBranch }}
                </p>
              </div>

              <div>
                <p class="text-slate-500">Root directory</p>
                <p class="mt-1 truncate font-medium text-slate-200">
                  {{ project.rootDirectory }}
                </p>
              </div>

              <div>
                <p class="text-slate-500">Deployments</p>
                <p class="mt-1 font-medium text-slate-200">
                  {{ project._count.deployments }}
                </p>
              </div>

              <div>
                <p class="text-slate-500">Last updated</p>
                <p class="mt-1 font-medium text-slate-200">
                  {{ formatDate(project.updatedAt) }}
                </p>
              </div>
            </div>

            <div v-if="project.deployments[0]?.commitMessage" class="mt-5">
              <p class="text-xs uppercase tracking-wide text-slate-500">
                Latest commit
              </p>

              <p class="mt-2 truncate text-sm text-slate-300">
                {{ project.deployments[0].commitMessage }}
              </p>
            </div>

            <div
              class="mt-6 flex items-center justify-between border-t border-slate-800 pt-5"
            >
              <a
                :href="project.repositoryUrl"
                class="text-sm text-slate-400 transition hover:text-white"
                rel="noopener noreferrer"
                target="_blank"
              >
                Repository ↗
              </a>

              <NuxtLink
                :to="`/projects/${project.id}`"
                class="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
              >
                Open project
              </NuxtLink>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>
