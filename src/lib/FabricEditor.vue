<!--
 * @Author: cyc
 * @Date: 2026-08-20 10:15:11
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 编辑器 Vue 组件外壳（组合核心引擎、插件与布局）
-->

<template>
  <div class="fabric-editor">
    <Layout style="height: 100vh">
      <Header class="fe-top">
        <slot name="topbar">
          <div class="fe-top-inner">
            <div class="fe-top-left">
              <TopbarImport />
              <Divider type="vertical" />
              <History />
            </div>
            <div class="fe-top-right">
              <!-- <PreviewCurrent /> -->
              <Clear v-if="showSaveButton" />
              <Button v-if="!previewing" type="primary" ghost @click="onQuickPreview">
                {{ t('variable.quick_preview') }}
              </Button>
              <Button v-else type="warning" ghost @click="onQuickPreview">
                {{ t('variable.restore') }}
              </Button>
              <Save v-if="showSaveButton" />
              <Button
                v-if="showSaveButton"
                class="fe-save-btn"
                type="primary"
                icon="md-checkmark"
                @click="onSaveRequest"
              >
                {{ t('save.submit') }}
              </Button>
            </div>
          </div>
        </slot>
      </Header>

      <Content style="display: flex; height: calc(100vh - 45px); position: relative">
        <!-- 左侧：容器始终渲染，收起时缩至菜单栏宽度（去除内容区空白） -->
        <div class="fe-left" :class="{ 'fe-left-collapsed': !state.leftShow }">
          <Menu
            v-if="state.ready"
            :active-name="activeTab"
            vertical
            accordion
            width="65px"
            @on-select="setActiveTab"
          >
            <MenuItem
              v-for="item in leftTabs"
              :key="item.key"
              :name="item.key"
              class="fe-menu-item"
            >
              <Icon :type="item.tab.icon || 'ios-apps'" size="20" />
              <div class="fe-menu-label">{{ item.tab.label }}</div>
            </MenuItem>
          </Menu>
          <div v-if="state.ready" v-show="state.leftShow" class="fe-left-content">
            <keep-alive>
              <component :is="activeComponent" v-bind="activeComponentProps" />
            </keep-alive>
          </div>
          <!-- 左栏收起按钮（fe-left 内部，right 定位） -->
          <div
            v-if="state.ready"
            :class="`close-btn left-btn ${state.leftShow && 'left-btn-open'}`"
            @click="toggleLeft"
          ></div>
        </div>

        <!-- 画布（始终渲染且稳定，fabric 的 .canvas-container 在此，Vue 不重排此处） -->
        <div id="workspace" class="fe-workspace">
          <div class="canvas-box">
            <div class="inside-shadow"></div>
            <canvas
              :id="canvasId"
              class="fe-canvas"
              :class="state.ruler ? 'design-stage-grid' : ''"
            ></canvas>
            <DragMode v-if="state.ready"></DragMode>
            <Zoom></Zoom>
          </div>
        </div>

        <!-- 右侧属性：容器始终渲染，内容 ready 后挂载 -->
        <div class="fe-right">
          <RightPanel v-if="state.ready" />
        </div>
      </Content>
      <!-- 统一图片来源选择器（tools / bgBar 共用） -->
      <ImagePickerModal />
    </Layout>
  </div>
</template>

<script>
import {
  ref,
  reactive,
  computed,
  provide,
  onMounted,
  onBeforeUnmount,
  getCurrentInstance,
} from '@vue/composition-api';
import { fabric } from 'fabric';
import { Message } from 'view-design';

import Editor from '@/core/index';
import {
  DringPlugin,
  AlignGuidLinePlugin,
  ControlsPlugin,
  CenterAlignPlugin,
  LayerPlugin,
  CopyPlugin,
  MoveHotKeyPlugin,
  DeleteHotKeyPlugin,
  EscHotKeyPlugin,
  GroupPlugin,
  DrawLinePlugin,
  GroupTextEditorPlugin,
  GroupAlignPlugin,
  WorkspacePlugin,
  HistoryPlugin,
  FlipPlugin,
  RulerPlugin,
  MaterialPlugin,
  WaterMarkPlugin,
  FontPlugin,
  PolygonModifyPlugin,
  DrawPolygonPlugin,
  FreeDrawPlugin,
  PathTextPlugin,
  PsdPlugin,
  SimpleClipImagePlugin,
  BarCodePlugin,
  QrCodePlugin,
  ImageStroke,
  ResizePlugin,
  LockPlugin,
  AddBaseTypePlugin,
  MaskPlugin,
  TextClipPlugin,
  VariablePlugin,
  AutoGrowPlugin,
} from '@/core/index';

import { createAdapterRegistry, createUiRegistry } from './registry';
import { createExtensionManager } from './extensionManager';
import { createEditorApi } from './api';
import { provideEditorContext } from '@/hooks/useEditorContext';
import { useI18n } from '@/hooks/useI18n';
import { installImageRenderGuard } from '@/core/patchImageRender';

import TopbarImport from './components/TopbarImport.vue';
import RightPanel from '@/views/home/components/right/index.vue';
import tools from '@/components/tools.vue';
import layer from '@/components/layer.vue';
import Zoom from '@/components/Zoom.vue';
import DragMode from '@/components/DragMode.vue';
import History from '@/components/History.vue';
// import PreviewCurrent from '@/components/PreviewCurrent.vue';
import Save from '@/components/Save.vue';
import Clear from '@/components/Clear.vue';
import ImagePickerModal from '@/components/ImagePickerModal.vue';

export default {
  name: 'FabricEditor',
  components: {
    TopbarImport,
    RightPanel,
    tools,
    layer,
    Zoom,
    DragMode,
    History,
    // PreviewCurrent,
    Save,
    Clear,
    ImagePickerModal,
  },
  props: {
    adapters: { type: Object, default: () => ({}) },
    extensions: { type: Array, default: () => [] },
    options: { type: Object, default: () => ({}) },
    // 强制远程图片模式：隐藏/禁用本地图片上传与"在线图转base64"，图片一律以远程URL入库
    remoteImageMode: { type: Boolean, default: false },
    // 文字元素的默认内容（替代原 i18n everything_is_fine / everything_goes_well）
    defaultText: { type: String, default: '新建文本' },
    defaultTextbox: { type: String, default: '新建文本' },
    defaultQrCodeData: { type: String, default: 'https://example.com' },
  },
  setup(props, { emit }) {
    const { t } = useI18n();
    // Message 提示时长：默认 5s，可通过 options.messageDuration 覆盖（0 表示不自动关闭）
    const messageDuration =
      props.options && props.options.messageDuration !== undefined
        ? props.options.messageDuration
        : 5;
    Message.config({ duration: messageDuration });
    const instance = getCurrentInstance();
    const uid = instance && instance.uid ? instance.uid : Math.random().toString(36).slice(2, 8);
    const canvasId = `fe-canvas-${uid}`;

    // ---- 注册表 / 扩展 / 引擎 ----
    const registry = createAdapterRegistry();
    const ui = createUiRegistry();
    const editor = new Editor();
    editor.options = props.options;
    const ctx = {
      canvas: null,
      editor,
      registry,
      ui,
      extensions: null,
      api: null,
      t,
      options: props.options,
      remoteImageMode: props.remoteImageMode,
    };
    const extensions = createExtensionManager({ registry, ui });
    extensions.setContext(ctx);
    ctx.extensions = extensions;
    const api = createEditorApi(ctx);
    ctx.api = api;

    // ---- 状态 ----
    const state = reactive({ ready: false, ruler: true, leftShow: true });
    const activeTab = ref('tools');

    // ---- 内置适配器 ----
    Object.keys(props.adapters).forEach((key) => {
      if (props.adapters[key]) registry.register(key, props.adapters[key]);
    });

    // ---- 扩展 ----
    (props.extensions || []).forEach((ext) => extensions.register(ext));

    // ---- 左侧 Tab ----
    const leftTabs = computed(() => {
      const tabs = [
        {
          key: 'tools',
          tab: { key: 'tools', label: t('elements'), icon: 'md-add-circle' },
          component: tools,
          props: {
            defaultText: props.defaultText,
            defaultTextbox: props.defaultTextbox,
          },
        },
        {
          key: 'layer',
          tab: { key: 'layer', label: t('layers'), icon: 'logo-buffer' },
          component: layer,
        },
      ];
      extensions.panelsByRegion.left.forEach((panel) => {
        tabs.push(panel);
      });
      return tabs;
    });

    const activeComponent = computed(() => {
      const found = leftTabs.value.find((item) => item.key === activeTab.value);
      return found ? found.component : null;
    });

    const activeComponentProps = computed(() => {
      const found = leftTabs.value.find((item) => item.key === activeTab.value);
      return found && found.props ? found.props : {};
    });

    const setActiveTab = (key) => {
      activeTab.value = key;
    };

    // ---- 画布初始化 ----
    const initCanvas = () => {
      // 0 尺寸图片元素跳过绘制，避免单张坏图（未完成加载/加载失败）拖垮整画布
      installImageRenderGuard();
      const canvasEl = document.getElementById(canvasId);
      const canvas = new fabric.Canvas(canvasEl, {
        fireRightClick: true,
        stopContextMenu: true,
        controlsAboveOverlay: true,
        preserveObjectStacking: true,
      });

      editor.init(canvas);
      // 导出被跨域图片污染（tainted canvas）拦截 → toast 提示，并转发 save-error 供宿主自定义
      editor.on('save:error', (err) => {
        Message.error((err && err.message) || t('save.export_failed'));
        emit('save-error', err);
      });
      const fontAdapter = props.adapters.font;
      const sizeAdapter = props.adapters.size;
      editor
        .use(DringPlugin)
        .use(PolygonModifyPlugin)
        .use(AlignGuidLinePlugin)
        .use(ControlsPlugin)
        .use(CenterAlignPlugin)
        .use(LayerPlugin)
        .use(CopyPlugin)
        .use(MoveHotKeyPlugin)
        .use(DeleteHotKeyPlugin)
        .use(EscHotKeyPlugin)
        .use(GroupPlugin)
        .use(DrawLinePlugin)
        .use(GroupTextEditorPlugin)
        .use(GroupAlignPlugin)
        .use(WorkspacePlugin)
        .use(TextClipPlugin)
        .use(HistoryPlugin)
        .use(FlipPlugin)
        .use(RulerPlugin)
        .use(DrawPolygonPlugin)
        .use(FreeDrawPlugin)
        .use(PathTextPlugin)
        .use(SimpleClipImagePlugin)
        .use(BarCodePlugin)
        .use(QrCodePlugin, { defaultData: props.defaultQrCodeData })
        .use(FontPlugin, { getFonts: fontAdapter ? () => fontAdapter.list() : undefined })
        .use(MaterialPlugin, { getSizes: sizeAdapter ? () => sizeAdapter.list() : undefined })
        .use(WaterMarkPlugin)
        .use(PsdPlugin)
        .use(ImageStroke)
        .use(ResizePlugin)
        .use(LockPlugin)
        .use(AddBaseTypePlugin)
        .use(MaskPlugin)
        .use(VariablePlugin)
        .use(AutoGrowPlugin);

      // 变量表（schema）注入：adapters.variable → VariablePlugin（业务无关协议，
      // 与 font/size 同构）。懒加载：ready 时不拉取，首次使用时 ensureSchemaLoaded
      if (props.adapters.variable) {
        const vp = editor.getPlugin('VariablePlugin');
        if (vp && vp.setSchemaAdapter) vp.setSchemaAdapter(props.adapters.variable);
      }

      // 开发者后门（A+C）：?varEdit=1 或 localStorage['fe:variable-editable']==='1'
      // 自动解锁变量表编辑（跳过 imported 只读限制），仅开发联调使用
      const devUnlockSchema = (() => {
        try {
          if (typeof location !== 'undefined' && /[?&]varEdit=1/.test(location.search)) return true;
          return localStorage.getItem('fe:variable-editable') === '1';
        } catch (e) {
          return false;
        }
      })();
      if (devUnlockSchema) {
        const vp = editor.getPlugin('VariablePlugin');
        if (vp && vp.setSchemaEditable) vp.setSchemaEditable(true);
      }

      ctx.canvas = canvas;
      state.ready = true;
      if (state.ruler) editor.rulerEnable();
      if (
        props.options &&
        props.options.workspace &&
        props.options.workspace.width &&
        props.options.workspace.height
      ) {
        editor.setSize(props.options.workspace.width, props.options.workspace.height);
      }
      emit('ready', { api, editor, canvas });
    };

    // ---- 标尺 ----
    // const toggleRuler = () => {
    //   state.ruler = !state.ruler;
    //   if (state.ruler) editor.rulerEnable();
    //   else editor.rulerDisable();
    //   document.activeElement && document.activeElement.blur && document.activeElement.blur();
    // };

    // ---- 左栏收起 ----
    const toggleLeft = () => {
      state.leftShow = !state.leftShow;
    };

    // ---- 保存按钮显隐 ----
    const showSaveButton = computed(() => props.options.showSaveButton !== false);

    // ---- 保存 ----
    // 顶栏保存按钮：向业务壳抛出最小化 JSON，持久化归业务
    // （业务监听 save-request 落库；PosterEditorHost 场景则回写交接信封）
    const onSaveRequest = () => {
      emit('save-request', { json: editor.getJson() });
    };

    // ---- 快速预览 ----
    // 行为等价变量弹窗 footer 的预览按钮（应用测试数据进入预览）；预览态切换为还原。
    // 顶栏常显，无法沿用弹窗打开时的 variables 快照做 disabled，点击时实时扫描兜底
    const previewing = ref(false);
    editor.on('variable:previewChange', (val) => {
      previewing.value = !!val;
    });
    const onQuickPreview = () => {
      if (previewing.value) {
        editor.exitPreview();
        return;
      }
      if (editor.getVariables().length === 0) {
        Message.info(t('variable.no_variable'));
        return;
      }
      editor.enterPreview();
      // 缺数据字段（无测试值/默认值兜底）预览隐藏，与渲染器"元素消失"同语义：可读性提示
      const hiddenCount = editor.getHiddenPreviewCount && editor.getHiddenPreviewCount();
      if (hiddenCount > 0) {
        Message.warning(t('variable.preview_hidden_hint'));
      }
    };

    onMounted(() => {
      initCanvas();
      if (instance && instance.proxy) instance.proxy.api = api;
    });

    onBeforeUnmount(() => editor.destory());

    provide('fabric', fabric);
    provide('canvasEditor', editor);
    provideEditorContext(ctx);

    return {
      t,
      canvasId,
      state,
      activeTab,
      leftTabs,
      activeComponent,
      activeComponentProps,
      setActiveTab,
      toggleLeft,
      // toggleRuler,
      showSaveButton,
      onSaveRequest,
      previewing,
      onQuickPreview,
      api,
    };
  },
};
</script>

<style lang="less" scoped>
.fabric-editor {
  height: 100vh;
  width: 100%;
  overflow: hidden;

  // 复刻 home：Layout 占满视口高度
  /deep/ .ivu-layout {
    height: 100vh;
  }
}

.fe-top {
  --height: 45px;
  height: var(--height);
  flex-shrink: 0;
  line-height: var(--height);
  padding: 0 0px;
  background: #fff;
  border-bottom: 1px solid #eef2f8;
  display: flex;
  align-items: center;

  /deep/ .ivu-layout-header {
    height: var(--height);
    line-height: var(--height);
    padding: 0 0;
  }

  .fe-top-inner {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
  }

  .fe-top-left {
    display: flex;
    align-items: center;
    padding-left: 20px;
  }

  .fe-top-right {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-right: 16px;
  }
}

.fe-left {
  width: 380px;
  background: #fff;
  display: flex;
  position: relative;
  flex-shrink: 0;
  height: 100%;
  overflow: visible;

  &.fe-left-collapsed {
    width: 65px;
  }

  /deep/ .ivu-menu-vertical {
    height: 100%;
    flex-shrink: 0;
  }

  /deep/ .fe-menu-item {
    text-align: center;
    padding: 10px 2px;
    box-sizing: border-box;
    font-size: 12px;
    height: auto;

    & > i {
      margin: 0;
    }
  }
}

.fe-menu-label {
  font-size: 12px;
  margin-top: 2px;
}

.fe-left-content {
  flex: 1;
  width: 220px;
  padding: 0 10px;
  height: 100%;
  overflow-y: auto;
}

.fe-workspace {
  flex: 1;
  width: 100%;
  position: relative;
  background: #f1f1f1;
  overflow: hidden;
}

.canvas-box {
  position: relative;
}

.inside-shadow {
  position: absolute;
  width: 100%;
  height: 100%;
  box-shadow: inset 0 0 9px 2px #0000001f;
  z-index: 2;
  pointer-events: none;
}

// canvas 初始尺寸（fabric 初始化时读取；随后由 WorkspacePlugin 按 #workspace 覆盖）
.fe-canvas {
  width: 300px;
  height: 300px;
  margin: 0 auto;
}

// 右栏作为透传容器：宽度/收起由 right/index.vue 自管理
.fe-right {
  display: contents;

  /deep/ .right-bar {
    flex-shrink: 0;
  }
}

// 收起按钮（左栏，位于 Content 层，left 跟随左栏右边缘）
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

// 网格背景
.design-stage-grid {
  --offsetX: 0px;
  --offsetY: 0px;
  --size: 16px;
  --color: #dedcdc;
  background-image: linear-gradient(
      45deg,
      var(--color) 25%,
      transparent 0,
      transparent 75%,
      var(--color) 0
    ),
    linear-gradient(45deg, var(--color) 25%, transparent 0, transparent 75%, var(--color) 0);
  background-position: var(--offsetX) var(--offsetY),
    calc(var(--size) + var(--offsetX)) calc(var(--size) + var(--offsetY));
  background-size: calc(var(--size) * 2) calc(var(--size) * 2);
}
</style>

<style lang="less">
// 全局修饰样式（attr-item-box/bg-item 布局 + viewUi focus 修复）。
// 必须保持非 scoped：这些 class 由各子组件/弹窗渲染，scoped 会因 data-v 属性失配。
// 随库构建打进 vue-fabric-editor.css，由使用方显式引入。
@import '~@/styles/index.less';
</style>
