<script lang="ts" setup>
import { computed } from "vue";
import type { DeploymentStatus } from "~/types/api";

// ✅ Assign the return value of defineProps to a variable
const props = defineProps<{
  status?: DeploymentStatus;
}>();

const label = computed(() => {
  if (!props.status) return "Not deployed";
  return props.status.replaceAll("_", " ");
});

const badgeClasses = computed(() => {
  switch (props.status) {
    case "READY":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_#10b98120]";
    case "FAILED":
    case "CANCELLED":
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    case "STOPPED":
      return "border-slate-600 bg-slate-800 text-slate-300";
    case "QUEUED":
    case "CLONING":
    case "ANALYZING":
    case "BUILDING":
    case "STARTING":
    case "HEALTH_CHECKING":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_#06b6d420]";
    case "ROLLED_BACK":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    default:
      return "border-slate-700 bg-slate-800 text-slate-400";
  }
});
</script>

<template>
  <span
    :class="badgeClasses"
    class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide"
  >
    <span
      v-if="
        status &&
        [
          'QUEUED',
          'CLONING',
          'ANALYZING',
          'BUILDING',
          'STARTING',
          'HEALTH_CHECKING',
        ].includes(status)
      "
      class="mr-2 h-1.5 w-1.5 animate-pulse rounded-full bg-current"
    />
    {{ label }}
  </span>
</template>
