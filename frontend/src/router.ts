import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", component: () => import("./views/RedirectView.vue") },
  // Categories live in the tool tree now; deep links land on the redirect page.
  { path: "/c/:id", redirect: "/" },
  {
    path: "/t/:id",
    name: "tool",
    component: () => import("./work/ToolHost.vue"),
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export { bespokeLoader, isKnownTool } from "./tools/bespoke";
