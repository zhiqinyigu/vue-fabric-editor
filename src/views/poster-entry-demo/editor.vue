<template>
  <PosterEditorHost :adapters="adapters" :options="options" />
</template>

<script>
// import Vue from 'vue';
// import ViewUI from 'view-design';
// import 'view-design/dist/styles/iview.css';
// import 'vue-fabric-editor/dist/vue-fabric-editor/vue-fabric-editor.css';
// import { createI18n } from 'vue-fabric-editor';
import { PosterEditorHost } from '@/examples/poster-entry';

// view-design 是包的 peer 依赖：包内组件模板使用 i-* 组件，需注册到本项目 Vue
// Vue.use(ViewUI);
// i18n 说明：包内组件模板依赖 $t，但包不会自动安装 vue-i18n 实例。
// 这里通过组件级 i18n 选项注入（vue-i18n 支持，作用域为该组件子树），
// 业务项目无需改自己的 main.js；若业务根实例已接入 i18n（含包内文案），可移除此项
// const i18n = createI18n();

export default {
  name: 'PosterEditorDemo',
  // i18n,
  components: { PosterEditorHost },
  data() {
    return {
      adapters: {
        font: {
          list: () =>
            Promise.resolve([
              { name: 'Arial', file: '', img: '' },
              { name: '微软雅黑', file: '', img: '' },
            ]),
        },
      },
      options: {},
    };
  },
};
</script>
