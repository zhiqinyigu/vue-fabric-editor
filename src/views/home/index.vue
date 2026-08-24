<!--
 * @Author: 秦少卫
 * @Date: 2024-05-17 15:30:21
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:45:32
 * @Description: file content
-->

<template>
  <div class="home">
    <Layout>
      <!-- 头部区域 -->
      <Top v-if="state.show" :ruler="state.ruler" @update:ruler="rulerSwitch"></Top>
      <Content style="display: flex; height: calc(100vh - 64px); position: relative">
        <!-- 左侧区域 -->
        <Left v-if="state.show"></Left>
        <!-- 画布区域 -->
        <div id="workspace">
          <div class="canvas-box">
            <div class="inside-shadow"></div>
            <canvas id="canvas" :class="state.ruler ? 'design-stage-grid' : ''"></canvas>
            <DragMode v-if="state.show"></DragMode>
            <Zoom></Zoom>
          </div>
        </div>
        <Right v-if="state.show"></Right>
      </Content>
      <!-- 统一图片来源选择器（tools / bgBar 共用） -->
      <ImagePickerModal></ImagePickerModal>
    </Layout>
  </div>
</template>

<script>
import { reactive, provide, onMounted, onUnmounted } from '@vue/composition-api';
import Top from './components/top/index.vue';
import Left from './components/left/index.vue';
import Right from './components/right/index.vue';

import Zoom from '@/components/Zoom.vue';
import DragMode from '@/components/DragMode.vue';
import ImagePickerModal from '@/components/ImagePickerModal.vue';
// 功能组件
import { fabric } from 'fabric';

import Editor, {
  DringPlugin,
  AlignGuidLinePlugin,
  ControlsPlugin,
  CenterAlignPlugin,
  LayerPlugin,
  CopyPlugin,
  MoveHotKeyPlugin,
  DeleteHotKeyPlugin,
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

const APIHOST = process.env.VUE_APP_APIHOST;

// 创建编辑器
const canvasEditor = new Editor();

export default {
  name: 'Home',
  components: {
    Top,
    Left,
    Right,
    Zoom,
    DragMode,
    ImagePickerModal,
  },
  setup() {
    const state = reactive({
      show: false,
      select: null,
      ruler: true,
    });

    onMounted(() => {
      // 初始化fabric
      const canvas = new fabric.Canvas('canvas', {
        fireRightClick: true, // 启用右键，button的数字为3
        stopContextMenu: true, // 禁止默认右键菜单
        controlsAboveOverlay: true, // 超出clipPath后仍然展示控制条
        // imageSmoothingEnabled: false, // 解决文字导出后不清晰问题
        preserveObjectStacking: true, // 当选择画布中的对象时，让对象不在顶层。
      });

      // 初始化编辑器
      canvasEditor.init(canvas);
      canvasEditor
        .use(DringPlugin)
        .use(PolygonModifyPlugin)
        .use(AlignGuidLinePlugin)
        .use(ControlsPlugin)
        .use(CenterAlignPlugin)
        .use(LayerPlugin)
        .use(CopyPlugin)
        .use(MoveHotKeyPlugin)
        .use(DeleteHotKeyPlugin)
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
        .use(QrCodePlugin)
        .use(FontPlugin, {
          repoSrc: APIHOST,
        })
        .use(MaterialPlugin, {
          repoSrc: APIHOST,
        })
        .use(WaterMarkPlugin)
        .use(PsdPlugin)
        .use(ImageStroke)
        .use(ResizePlugin)
        .use(LockPlugin)
        .use(AddBaseTypePlugin)
        .use(MaskPlugin)
        .use(VariablePlugin)
        .use(AutoGrowPlugin);

      state.show = true;
      // 默认打开标尺
      if (state.ruler) {
        canvasEditor.rulerEnable();
      }
    });

    onUnmounted(() => canvasEditor.destory());

    provide('fabric', fabric);
    provide('canvasEditor', canvasEditor);

    const rulerSwitch = (val) => {
      if (val) {
        canvasEditor.rulerEnable();
      } else {
        canvasEditor.rulerDisable();
      }
      // 使标尺开关组件失焦，避免响应键盘的空格事件
      document.activeElement.blur();
    };

    return {
      state,
      rulerSwitch,
    };
  },
};
</script>

<style lang="less" scoped>
::v-deep .ivu-layout-header {
  --height: 45px;
  padding: 0 0px;
  border-bottom: 1px solid #eef2f8;
  background: #fff;
  height: var(--height);
  line-height: var(--height);
  display: flex;
  justify-content: space-between;
}

.home,
.ivu-layout {
  height: 100vh;
}

.icon {
  display: block;
}

.canvas-box {
  position: relative;
}

// 画布内阴影
.inside-shadow {
  position: absolute;
  width: 100%;
  height: 100%;
  box-shadow: inset 0 0 9px 2px #0000001f;
  z-index: 2;
  pointer-events: none;
}

#canvas {
  width: 300px;
  height: 300px;
  margin: 0 auto;
}

#workspace {
  flex: 1;
  width: 100%;
  position: relative;
  background: #f1f1f1;
  overflow: hidden;
}

// 标尺
.switch {
  margin-right: 10px;
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
