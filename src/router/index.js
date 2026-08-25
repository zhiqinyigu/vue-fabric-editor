import Router from 'vue-router';
import Vue from 'vue';
import routes from './routes';

Vue.use(Router);

const router = new Router({
  routes,
  mode: 'hash',
  scrollBehavior() {
    return { x: 0, y: 0 };
  },
});

export default router;
