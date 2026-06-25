import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    component: () => import('../layouts/AppLayout.vue'),
    redirect: '/home',
    children: [
      {
        path: 'home',
        name: 'home',
        component: () => import('../views/HomeView.vue'),
        meta: { title: '首页' },
      },
      {
        path: 'calendar',
        name: 'calendar',
        component: () => import('../views/CalendarView.vue'),
        meta: { title: '考勤管理' },
      },
      {
        path: 'tasks',
        name: 'tasks',
        component: () => import('../views/TasksView.vue'),
        meta: { title: '任务管理' },
      },
      {
        path: 'files',
        name: 'files',
        component: () => import('../views/FilesView.vue'),
        meta: { title: '文件管理' },
      },
      {
        path: 'water',
        name: 'water',
        component: () => import('../views/WaterView.vue'),
        meta: { title: '喝水管理' },
      },
      {
        path: 'toilet',
        name: 'toilet',
        component: () => import('../views/ToiletView.vue'),
        meta: { title: '如厕提醒' },
      },
      {
        path: 'messages',
        name: 'messages',
        component: () => import('../views/MessagesView.vue'),
        meta: { title: '消息中心' },
      },
      {
        path: 'browser',
        name: 'browser',
        component: () => import('../views/BrowserRoutePlaceholder.vue'),
        meta: { title: '浏览器' },
      },
      {
        path: 'logs',
        name: 'logs',
        component: () => import('../views/LogsView.vue'),
        meta: { title: '日志管理' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../views/SettingsView.vue'),
        meta: { title: '系统设置' },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
