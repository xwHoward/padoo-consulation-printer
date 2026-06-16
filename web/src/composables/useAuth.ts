import { ref, computed } from "vue";
import { app, auth, checkLogin, logout as cloudLogout } from "../utils/cloudbase";

interface AuthUser {
  uid: string;
  name?: string;
  email?: string;
  username?: string;
}

const isLoggedIn = ref(false);
const currentUser = ref<AuthUser | null>(null);
const isLoading = ref(true);
const loginError = ref("");
let authInitialized = false;

const isReady = computed(() => !isLoading.value);

async function initAuth() {
  if (authInitialized) return;
  authInitialized = true;
  isLoading.value = true;
  try {
    const result = await checkLogin();
    isLoggedIn.value = result.isLoggedIn;
    if (result.user) {
      currentUser.value = {
        uid: result.user.uid,
        name: result.user.name,
        email: result.user.email,
        username: result.user.username,
      };
    }
  } catch (error) {
    console.error("初始化认证失败:", error);
    isLoggedIn.value = false;
    currentUser.value = null;
  } finally {
    isLoading.value = false;
  }
}

async function login(username: string, password: string): Promise<boolean> {
  loginError.value = "";
  try {
    await auth.signInWithUsernameAndPassword(username, password);
    authInitialized = false;
    await initAuth();
    return isLoggedIn.value;
  } catch (error: any) {
    const msg = error?.message || "登录失败";
    if (msg.includes("用户不存在") || msg.includes("user not found")) {
      loginError.value = "用户不存在";
    } else if (msg.includes("密码错误") || msg.includes("password")) {
      loginError.value = "密码错误";
    } else {
      loginError.value = msg;
    }
    return false;
  }
}

async function handleLogout() {
  try {
    await cloudLogout();
  } catch (error) {
    console.error("退出登录失败:", error);
  } finally {
    isLoggedIn.value = false;
    currentUser.value = null;
    authInitialized = false;
  }
}

const db = app.database();

export function useAuth() {
  return {
    isLoggedIn,
    currentUser,
    isLoading,
    isReady,
    loginError,
    initAuth,
    login,
    logout: handleLogout,
    db,
  };
}
