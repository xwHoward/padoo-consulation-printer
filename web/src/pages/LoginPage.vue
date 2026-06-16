<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-100 px-4">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-gray-900">趴岛工作台</h1>
        <p class="mt-2 text-sm text-gray-500">门店后台管理系统</p>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h2 class="mb-6 text-lg font-semibold text-gray-900">登录</h2>

        <div
          v-if="loginError"
          class="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {{ loginError }}
        </div>

        <form @submit.prevent="handleLogin">
          <div class="mb-4">
            <label class="mb-1 block text-sm font-medium text-gray-700">
              用户名
            </label>
            <input
              v-model="username"
              type="text"
              required
              class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入用户名"
            />
          </div>

          <div class="mb-6">
            <label class="mb-1 block text-sm font-medium text-gray-700">
              密码
            </label>
            <input
              v-model="password"
              type="password"
              required
              class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入密码"
            />
          </div>

          <button
            type="submit"
            :disabled="submitting"
            class="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              v-if="submitting"
              class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            ></span>
            {{ submitting ? "登录中..." : "登录" }}
          </button>
        </form>
      </div>

      <p class="mt-6 text-center text-xs text-gray-400">
        Powered by CloudBase
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";

const router = useRouter();
const { login, loginError } = useAuth();

const username = ref("");
const password = ref("");
const submitting = ref(false);

async function handleLogin() {
  submitting.value = true;
  const success = await login(username.value, password.value);
  submitting.value = false;

  if (success) {
    const redirect = (router.currentRoute.value.query.redirect as string) || "/dashboard";
    router.replace(redirect);
  }
}
</script>
