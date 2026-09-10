<template>
  <PosterEditorHost :adapters="adapters" :options="options" remote-image-mode />
</template>

<script>
// import Vue from 'vue';
// import ViewUI from 'view-design';
// import 'view-design/dist/styles/iview.css';
// import 'vue-fabric-editor/dist/vue-fabric-editor/vue-fabric-editor.css';
// import { createI18n } from 'vue-fabric-editor';
import { PosterEditorHost } from '@/examples/poster-entry';
import { createVariableSchemaAdapter } from '@/examples/poster-entry/admin/variableSchemaAdapter';

// view-design 是包的 peer 依赖：包内组件模板使用 i-* 组件，需注册到本项目 Vue
// Vue.use(ViewUI);

// 演示用编辑器页：读取交接信封加载 JSON → FabricEditor 编辑 → 保存回传来源页
//
// 变量表（schema）存储：adapters.variable（list/save 契约）。业务侧拼好存储键后经交接
// query 携带（Entry.openEditor 转发 variableContext）：
//   /poster-editor-demo?field=<交接字段key>&token=...&category=<pagePath>&fieldId=<keyStr>
// category/fieldId 分别即 pagePath/keyStr；缺任一（直接访问/来源页未传）时不注入，
// 变量表降级为会话内编辑 + 导出 JSON。
// 本 demo 用 localStorage 模拟落库（variableSchemaAdapter），业务项目替换为后端 KV 实现。
//
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
      options: {},
    };
  },
  computed: {
    // adapters 用 computed：variable 依赖交接 query 携带的存储键（category/fieldId）
    adapters() {
      const adapters = {
        // 演示用字体适配器（无真实字体文件，仅字体名）
        font: {
          list: () =>
            Promise.resolve([
              { name: 'Arial', file: '', img: '' },
              { name: '微软雅黑', file: '', img: '' },
            ]),
        },
      };
      // query 契约：category=pagePath、fieldId=keyStr（业务侧拼好，见 variableSchemaAdapter）
      const { category, fieldId } = this.$route.query || {};
      if (category && fieldId) {
        adapters.variable = createVariableSchemaAdapter({ pagePath: category, keyStr: fieldId });
      }
      return adapters;
    },
  },
};
</script>
