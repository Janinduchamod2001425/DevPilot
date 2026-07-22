<template>
  <header class="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
    <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
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

      <div
        class="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400"
      >
        Local environment
      </div>
    </div>
  </header>
</template>
