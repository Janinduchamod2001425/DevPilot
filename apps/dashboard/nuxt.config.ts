export default defineNuxtConfig({
  compatibilityDate: "2026-07-17",
  devtools: { enabled: true },
  modules: ["@nuxtjs/tailwindcss", "@nuxt/eslint"],
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api",
    },
  },
  typescript: {
    strict: true,
  },
});
