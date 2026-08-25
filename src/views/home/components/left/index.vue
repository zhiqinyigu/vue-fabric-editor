<script>
// 左侧组件
import { reactive, ref, onMounted } from '@vue/composition-api';
import importTmpl from '@/components/importTmpl.vue';
import tools from '@/components/tools.vue';
import layer from '@/components/layer.vue';
// 路由
import { useRoute } from '@/hooks/useRouter';

export default {
  name: 'Left',
  components: {
    importTmpl,
    tools,
    layer,
  },
  setup() {
    const route = useRoute();

    const state = reactive({
      menuActive: 1,
      toolsBarShow: true,
    });
    // 左侧菜单渲染（label 通过 $t(nameKey) 渲染，避免 computed ref 嵌套在 reactive 中不自动解包）
    const menuActive = ref('importTmpl');
    const leftBarComponent = {
      importTmpl,
      tools,
      layer,
    };

    const leftBar = [
      {
        //模板
        key: 'importTmpl',
        nameKey: 'templates',
        icon: 'md-book',
      },
      {
        //基础元素
        key: 'tools',
        nameKey: 'elements',
        icon: 'md-add-circle',
      },
      {
        // 图层
        key: 'layer',
        nameKey: 'layers',
        icon: 'logo-buffer',
      },
    ];
    // 隐藏工具条
    const hideToolsBar = () => {
      state.toolsBarShow = !state.toolsBarShow;
    };
    // 展示工具条
    const showToolsBar = (val) => {
      menuActive.value = val;
      state.toolsBarShow = true;
    };

    onMounted(() => {
      // 有ID时，打开作品面板
      if (route && route.query && route.query.id) {
        menuActive.value = 'myMaterial';
      }
    });

    return {
      state,
      menuActive,
      leftBarComponent,
      leftBar,
      hideToolsBar,
      showToolsBar,
    };
  },
};
</script>

<template>
  <div :class="`left-bar ${state.toolsBarShow && 'show-tools-bar'}`">
    <!-- 左侧菜单 -->
    <Menu :active-name="menuActive" accordion width="65px" @on-select="showToolsBar">
      <MenuItem v-for="item in leftBar" :key="item.key" :name="item.key" class="menu-item">
        <Icon :type="item.icon" size="24" />
        <div>{{ $t(item.nameKey) }}</div>
      </MenuItem>
    </Menu>
    <!-- 左侧组件 -->
    <div v-show="state.toolsBarShow" class="content">
      <div class="left-panel">
        <keep-alive>
          <component :is="leftBarComponent[menuActive]"></component>
        </keep-alive>
      </div>
    </div>
    <!-- 关闭按钮 -->
    <div
      :class="`close-btn left-btn ${state.toolsBarShow && 'left-btn-open'}`"
      @click="hideToolsBar"
    ></div>
  </div>
</template>

<style lang="less" scoped>
// 左侧容器
.left-bar {
  width: 65px;
  height: 100%;
  background: #fff;
  display: flex;
  position: relative;

  &.show-tools-bar {
    width: 380px;
  }
}
.ivu-menu-vertical .menu-item {
  text-align: center;
  padding: 10px 2px;
  box-sizing: border-box;
  font-size: 12px;

  & > i {
    margin: 0;
  }
}
.ivu-menu-light.ivu-menu-vertical .ivu-menu-item-active:not(.ivu-menu-submenu) {
  background: none;
}

.content {
  flex: 1;
  width: 220px;
  padding: 0 10px;
  height: 100%;
  overflow-y: auto;
}

// 关闭按钮
.close-btn {
  width: 27px;
  height: 70px;
  cursor: pointer;
  background-image: url('~@/assets/icon/side_close_right.png');
  background-repeat: no-repeat;
  background-size: cover;
  background-position: 50%;
  position: absolute;
  right: -26px;
  z-index: 3;
  top: 50%;
  margin-top: -10px;

  &.left-btn-open {
    background-image: url('~@/assets/icon/side_close.png');
    transform: rotateY(360deg);
  }
}
</style>
