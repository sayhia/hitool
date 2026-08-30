import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { initLang } from "./lib/i18n";
import { initTheme } from "./lib/theme";
import { initSidebar } from "./stores/sidebar";
import { initAutoUpdate } from "./stores/update";
import "./styles/tokens.css";
import "./styles/base.css";

Promise.all([initLang(), initTheme(), initSidebar(), initAutoUpdate()]).finally(() => {
  createApp(App).use(router).mount("#app");
});
