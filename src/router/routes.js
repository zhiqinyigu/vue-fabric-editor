import { setToken, autoLogin, logout } from '@/api/user';

const routes = [
  {
    path: '/',
    beforeEnter: async (to, from, next) => {
      // 自动登录功能
      if (to.query.username && to.query.key) {
        const res = await autoLogin({
          username: to.query.username,
          projectid: to.query.projectid,
          key: to.query.key,
        });
        if (res.data.jwt) {
          setToken(res.data.jwt);
        } else {
          logout();
          alert('签名失败');
          window.location.href = '/';
        }
      }
      next();
    },
    component: () => import('@/views/home/index.vue'),
  },
  {
    path: '/template',
    component: () => import('@/views/template/index.vue'),
  },
  {
    path: '/demo',
    component: () => import('@/views/demo/index.vue'),
  },
  {
    path: '/renderer-demo',
    component: () => import('@/views/renderer-demo/index.vue'),
  },
  {
    path: '/legacy-demo',
    component: () => import('@/views/legacy-demo/index.vue'),
  },
];

export default routes;
