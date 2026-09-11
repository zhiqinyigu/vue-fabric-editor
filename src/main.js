import Vue from 'vue';
import App from './App.vue';
import router from './router';
import ViewUI from 'view-design';
import { Message } from 'view-design';
import 'view-design/dist/styles/iview.css';
import './styles/index.less';
import VueLazyload from 'vue-lazyload';
// 自定义字体文件
import '@/assets/fonts/font.css';

import { VueMasonryPlugin } from 'vue-masonry';

import VueCompositionAPI from '@vue/composition-api';
Vue.use(VueCompositionAPI);

import i18n from './language/index';

Vue.use(VueMasonryPlugin);
Vue.use(VueLazyload, {});
Vue.use(ViewUI);

// Message 提示时长全局默认 5s（view-design 默认 1.5s 太短，仅应用站点生效；包消费者由 FabricEditor options.messageDuration 控制）
Message.config({ duration: 5 });

Vue.config.productionTip = false;

new Vue({
  router,
  i18n,
  render: (h) => h(App),
}).$mount('#app');
