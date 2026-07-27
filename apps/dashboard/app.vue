<script lang="ts" setup>
import { Toaster } from "vue-sonner";
import "vue-sonner/style.css";
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-950 text-white">
    <AppHeader />

    <main class="flex-1 pt-[72px]">
      <NuxtPage />
    </main>

    <ClientOnly>
      <Toaster
        :close-button="true"
        :duration="4000"
        :rich-colors="true"
        position="top-right"
        theme="dark"
      />
    </ClientOnly>
  </div>
</template>
