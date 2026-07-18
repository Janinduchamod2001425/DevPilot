<script setup lang="ts">
const config = useRuntimeConfig();

const { data: health, error } = await useFetch<{ status: string; service: string }>(
  `${config.public.apiBaseUrl}/health`,
  { server: false },
);
</script>

<template>
  <main class="min-h-screen bg-slate-950 px-6 py-20 text-white">
    <div class="mx-auto max-w-5xl">
      <p class="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
        Self-hosted deployment platform
      </p>
      <h1 class="text-5xl font-bold tracking-tight sm:text-7xl">DevPilot</h1>
      <p class="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
        Build, deploy, monitor, and understand applications from one engineering platform.
      </p>

      <section class="mt-12 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 class="text-lg font-semibold">Platform status</h2>
        <p v-if="health" class="mt-3 text-emerald-400">
          API connected · {{ health.status }}
        </p>
        <p v-else-if="error" class="mt-3 text-amber-400">
          Dashboard ready · API is currently offline
        </p>
        <p v-else class="mt-3 text-slate-400">Checking API connection…</p>
      </section>
    </div>
  </main>
</template>
