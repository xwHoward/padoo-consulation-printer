import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { useAuth } from "./composables/useAuth";
import "./style.css";

async function bootstrap() {
  const app = createApp(App);
  app.use(router);

  const { initAuth, isLoggedIn, isReady } = useAuth();
  await initAuth();

  router.beforeEach(async (to, _from, next) => {
    if (!isReady.value) {
      await initAuth();
    }

    if (to.name === "Login") {
      if (isLoggedIn.value) {
        next({ path: "/dashboard" });
      } else {
        next();
      }
      return;
    }

    if (!isLoggedIn.value) {
      next({ path: "/login", query: { redirect: to.fullPath } });
      return;
    }

    next();
  });

  app.mount("#app");
}

bootstrap();
