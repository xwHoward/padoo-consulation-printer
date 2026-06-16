<template>
  <div
    v-if="isLoading"
    class="flex min-h-screen items-center justify-center bg-gray-100"
  >
    <div class="text-center">
      <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      <p class="mt-4 text-sm text-gray-500">加载中...</p>
    </div>
  </div>
  <RouterView v-else />
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import { useAuth } from "./composables/useAuth";

const { isLoading } = useAuth();
</script>
