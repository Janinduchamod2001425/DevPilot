<script lang="ts" setup>
import { Icon } from "@iconify/vue";

const { toasts, dismiss } = useToast();

const iconFor = (type: string) => {
  switch (type) {
    case "success":
      return "mdi:check-circle";
    case "error":
      return "mdi:alert-circle";
    case "warning":
      return "mdi:alert";
    default:
      return "mdi:information";
  }
};

const colorFor = (type: string) => {
  switch (type) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "error":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  }
};
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <div
        class="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto"
      >
        <TransitionGroup name="toast">
          <div
            v-for="toast in toasts"
            :key="toast.id"
            :class="colorFor(toast.type)"
            class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-sm"
          >
            <Icon :icon="iconFor(toast.type)" class="mt-0.5 h-5 w-5 shrink-0" />
            <p class="flex-1 text-sm leading-5">{{ toast.message }}</p>
            <button
              class="shrink-0 text-current opacity-60 hover:opacity-100"
              @click="dismiss(toast.id)"
            >
              <Icon class="h-4 w-4" icon="mdi:close" />
            </button>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
