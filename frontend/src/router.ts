import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", component: () => import("./views/LandingView.vue") },
  { path: "/c/:id", component: () => import("./views/CategoryView.vue") },
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
