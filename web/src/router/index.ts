import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import AdminLayout from "../layouts/AdminLayout.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("../pages/LoginPage.vue"),
    meta: { title: "登录" },
  },
  {
    path: "/",
    component: AdminLayout,
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        name: "Dashboard",
        component: () => import("../pages/dashboard/DashboardPage.vue"),
        meta: { title: "数据分析仪表板", icon: "chart" },
      },
      {
        path: "customers",
        name: "Customers",
        component: () => import("../pages/customers/CustomersPage.vue"),
        meta: { title: "客户管理", icon: "users" },
      },
      {
        path: "cashier",
        name: "Cashier",
        component: () => import("../pages/cashier/CashierPage.vue"),
        meta: { title: "收银管理", icon: "cash" },
      },
      {
        path: "reservations",
        name: "Reservations",
        component: () => import("../pages/reservations/ReservationsPage.vue"),
        meta: { title: "预约管理", icon: "calendar" },
      },
      {
        path: "schedule",
        name: "Schedule",
        component: () => import("../pages/schedule/SchedulePage.vue"),
        meta: { title: "技师排班", icon: "clock" },
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/dashboard",
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
export { routes };
