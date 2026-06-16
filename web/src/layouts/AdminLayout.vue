<template>
  <div class="flex h-screen bg-gray-100">
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-gray-200 bg-white transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0 lg:static lg:inset-auto',
      ]"
    >
      <div class="flex h-14 items-center border-b border-gray-200 px-4">
        <h1 class="text-sm font-bold text-gray-900">趴岛工作台</h1>
      </div>

      <nav class="flex-1 overflow-y-auto py-4">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="mx-3 mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors"
          :class="isActive(item.path) ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'"
        >
          <span class="mr-3 flex h-5 w-5 items-center justify-center">
            <svg
              v-if="item.icon === 'chart'"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <svg
              v-else-if="item.icon === 'users'"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <svg
              v-else-if="item.icon === 'cash'"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <svg
              v-else-if="item.icon === 'calendar'"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <svg
              v-else-if="item.icon === 'clock'"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg
              v-else-if="item.icon === 'logout'"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </span>
          {{ item.title }}
        </RouterLink>
      </nav>

      <div class="border-t border-gray-200 p-4">
        <button
          @click="handleLogout"
          class="flex w-full items-center rounded-lg px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <span class="mr-3 flex h-5 w-5 items-center justify-center">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </span>
          退出登录
        </button>
      </div>
    </aside>

    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-20 bg-black opacity-50 lg:hidden"
      @click="sidebarOpen = false"
    ></div>

    <div class="flex flex-1 flex-col overflow-hidden">
      <header class="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
        <button
          class="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          @click="sidebarOpen = !sidebarOpen"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-500">{{ currentUser?.name || currentUser?.username || "管理员" }}</span>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";

const route = useRoute();
const router = useRouter();
const { currentUser, logout } = useAuth();

const sidebarOpen = ref(false);

const navItems = [
  { path: "/dashboard", title: "数据分析仪表板", icon: "chart" },
  { path: "/customers", title: "客户管理", icon: "users" },
  { path: "/cashier", title: "收银管理", icon: "cash" },
  { path: "/reservations", title: "预约管理", icon: "calendar" },
  { path: "/schedule", title: "技师排班", icon: "clock" },
];

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + "/");
}

async function handleLogout() {
  await logout();
  router.replace("/login");
}
</script>
