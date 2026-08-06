export default defineNuxtConfig({
  app: {
    head: {
      title: "DevPilot",
      titleTemplate: "%s | DevPilot",
      meta: [
        {
          name: "description",
          content:
            "DevPilot — self-hosted application deployment and management platform.",
        },
      ],
    },
  },
  compatibilityDate: "2026-07-17",
  devtools: { enabled: true },
  modules: ["@nuxtjs/tailwindcss", "@nuxt/eslint", "@vueuse/motion/nuxt"],
  devServer: {
    port: 3001,
  },
  runtimeConfig: {
    public: {
      apiBaseUrl:
        process.env.NUXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api",
    },
  },
  typescript: {
    strict: true,
  },
});
