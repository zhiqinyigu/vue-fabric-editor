<script>
import { inject, ref, onMounted, onBeforeUnmount } from '@vue/composition-api';
import Align from '@/components/Align.vue';

import Hide from '@/components/Hide.vue';
import Group from '@/components/Group.vue';
import Lock from '@/components/Lock.vue';
import Edit from '@/components/Edit.vue';

import BgBar from '@/components/BgBar.vue';
import SetSize from '@/components/SetSize.vue';
import ReplaceImg from '@/components/ReplaceImg.vue';
import Filters from '@/components/Filters.vue';
import ImgStroke from '@/components/ImgStroke.vue';
import AttributeOnlineImg from '@/components/AttributeOnlineImg.vue';
import AttributeVariable from '@/components/AttributeVariable.vue';

// 右侧组件
import AttributePostion from '@/components/AttributePostion.vue';
import AttributeClip from '@/components/AttributeClip.vue';
import AttributeDisplay from '@/components/AttributeDisplay.vue';
import AttributeDisplayText from '@/components/AttributeDisplayText.vue';
import AttributeId from '@/components/AttributeId.vue';
import AttributeShadow from '@/components/AttributeShadow.vue';
import AttributeBorder from '@/components/AttributeBorder.vue';
import AttributeRounded from '@/components/AttributeRounded.vue';
import AttributeFont from '@/components/AttributeFont.vue';
import AttributeTextFloat from '@/components/AttributeTextFloat.vue';
import AttributeColor from '@/components/AttributeColor.vue';
import AttributeBlend from '@/components/AttributeBlend.vue';
import AttributeBarcode from '@/components/AttributeBarcode.vue';
import AttributeQrCode from '@/components/AttributeQrCode.vue';
import AttributeTextContent from '@/components/AttributeTextContent.vue';
import ClipImage from '@/components/ClipImage.vue';
import CropperImg from '@/components/CropperImg.vue';
// 快捷操作图标（flip / centerAlign 内联到工具栏，保证等宽布局）
import FlipX from '@/assets/icon/flip/x.svg';
import FlipY from '@/assets/icon/flip/y.svg';
import CenterIcon from '@/assets/icon/centerAlign/center.svg';
import CenterX from '@/assets/icon/centerAlign/CenterX.svg';
import CenterY from '@/assets/icon/centerAlign/CenterY.svg';
// hooks
import useSelectListen from '@/hooks/useSelectListen';
import { Message } from 'view-design';
import AttrSection from '@/components/attrPanel/AttrSection.vue';

export default {
  name: 'Right',
  components: {
    Align,
    Hide,
    Group,
    Lock,
    Edit,
    BgBar,
    SetSize,
    AttributeVariable,
    ReplaceImg,
    AttributeOnlineImg,
    Filters,
    ImgStroke,
    AttributePostion,
    AttributeClip,
    AttributeDisplay,
    AttributeDisplayText,
    AttributeId,
    AttributeShadow,
    AttributeBorder,
    AttributeRounded,
    AttributeFont,
    AttributeTextFloat,
    AttributeColor,
    AttributeBlend,
    AttributeBarcode,
    AttributeQrCode,
    AttributeTextContent,
    ClipImage,
    CropperImg,
    FlipX,
    FlipY,
    CenterIcon,
    CenterX,
    CenterY,
    AttrSection,
  },
  setup() {
    const canvasEditor = inject('canvasEditor');

    const { mixinState } = useSelectListen(canvasEditor);

    const attrBarShow = ref(true);

    const copyElementJson = async () => {
      const ok = await canvasEditor.copyActiveObjectJson();
      if (ok) {
        Message.success('已复制元素数据');
      } else {
        Message.warning('请先选中一个元素');
      }
    };

    // 当前选中图片的类型：normal 普通图片 / online 网络图片 / variable 变量图片
    const imageType = ref('normal');

    // 裁切会话（裁切 shell 选中）：useSelectListen 会将 shell 判空，
    // 空态容器里的「变量配置」按钮会在此期间漏出，须显式抑制
    const cropSession = ref(false);
    const refreshCropSession = () => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      cropSession.value = !!(activeObject && activeObject.get && activeObject.get('clip') === true);
    };

    const isOnlineUrl = (src) => typeof src === 'string' && /^https?:\/\/.+$/i.test(src);

    // 变量插件（判断 URL 是否含变量包裹符）
    const getVariablePlugin = () => canvasEditor.getPlugin?.('VariablePlugin') || null;
    const isVariableImage = (obj, src) => {
      if (!obj || typeof src !== 'string') return false;
      if (obj.get('isVariableImage') === true) return true;
      const vp = getVariablePlugin();
      return !!(vp && vp.containsVariable && vp.containsVariable(src));
    };
    // 变量图片优先于网络图片判断（变量 URL 通常也是 http/https 开头）
    const refreshImageType = () => {
      imageType.value = 'normal';
      const activeObject = canvasEditor.canvas.getActiveObject();
      if (activeObject && activeObject.type === 'image' && activeObject.getSrc) {
        const src = activeObject.getSrc();
        if (isVariableImage(activeObject, src)) {
          imageType.value = 'variable';
        } else if (isOnlineUrl(src)) {
          imageType.value = 'online';
        }
      }
    };

    onMounted(() => {
      refreshImageType();
      refreshCropSession();
      canvasEditor.on('selectOne', refreshImageType);
      canvasEditor.on('selectCancel', refreshImageType);
      canvasEditor.canvas.on('object:modified', refreshImageType);
      // 裁切会话检测：selection 直连 + 交互过程实时刷新（判空态下编辑器事件不派发 selection）
      canvasEditor.on('selectOne', refreshCropSession);
      canvasEditor.on('selectCancel', refreshCropSession);
      const canvas = canvasEditor.canvas;
      canvas.on('selection:created', refreshCropSession);
      canvas.on('selection:updated', refreshCropSession);
      canvas.on('selection:cleared', refreshCropSession);
    });
    onBeforeUnmount(() => {
      canvasEditor.off('selectOne', refreshImageType);
      canvasEditor.off('selectCancel', refreshImageType);
      canvasEditor.canvas.off('object:modified', refreshImageType);
      canvasEditor.off('selectOne', refreshCropSession);
      canvasEditor.off('selectCancel', refreshCropSession);
      canvasEditor.canvas.off('selection:created', refreshCropSession);
      canvasEditor.canvas.off('selection:updated', refreshCropSession);
      canvasEditor.canvas.off('selection:cleared', refreshCropSession);
    });

    // 属性面板开关
    const switchAttrBar = () => {
      attrBarShow.value = !attrBarShow.value;
    };

    // 翻转元素
    const flip = (type) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      activeObject && activeObject.set(`flip${type}`, !activeObject[`flip${type}`]).setCoords();
      canvasEditor.canvas.requestRenderAll();
    };

    // 相对画布/工作区对齐
    const position = (name) => {
      canvasEditor.position(name);
    };

    return {
      canvasEditor,
      mixinState,
      attrBarShow,
      switchAttrBar,
      copyElementJson,
      flip,
      position,
      cropSession,
      imageType,
    };
  },
};
</script>

<template>
  <div style="display: contents">
    <!-- 属性区域 380-->
    <div v-show="attrBarShow" class="right-bar">
      <!-- 未选择元素时 展示背景设置（裁切会话判空态下抑制，避免变量配置按钮漏出） -->
      <div v-show="!mixinState.mSelectMode && !cropSession">
        <SetSize></SetSize>
        <BgBar></BgBar>
        <AttributeVariable></AttributeVariable>
      </div>

      <!-- 快捷操作（单选/多选共用，按钮按条件显示） -->
      <div v-show="mixinState.mSelectMode" class="attr-item-box" style="padding-bottom: 6px">
        <div v-show="mixinState.mSelectMode" class="bg-item">
          <Tooltip :content="$t('attrSeting.centerAlign.centerX')">
            <Button long type="text" @click="position('centerH')">
              <CenterX width="18" height="18"></CenterX>
            </Button>
          </Tooltip>
          <Tooltip :content="$t('attrSeting.centerAlign.centerY')">
            <Button long type="text" @click="position('centerV')">
              <CenterY width="18" height="18"></CenterY>
            </Button>
          </Tooltip>
          <Tooltip :content="$t('attrSeting.centerAlign.center')">
            <Button long type="text" @click="position('center')">
              <CenterIcon width="18" height="18"></CenterIcon>
            </Button>
          </Tooltip>

          <Divider type="vertical" />
          <Tooltip :content="$t('attrSeting.flip.x')">
            <Button long type="text" @click="flip('X')">
              <FlipX width="18" height="18"></FlipX>
            </Button>
          </Tooltip>
          <Tooltip :content="$t('attrSeting.flip.y')">
            <Button long type="text" @click="flip('Y')">
              <FlipY width="18" height="18"></FlipY>
            </Button>
          </Tooltip>

          <Divider type="vertical" />
          <Lock></Lock>
          <!-- <dele></dele> -->
          <!-- <clone></clone> -->
          <Hide></Hide>
          <Edit></Edit>
        </div>
      </div>

      <!-- 多选时展示 -->
      <div v-show="mixinState.mSelectMode === 'multiple'">
        <!-- 分组 -->
        <Group></Group>
        <Align></Align>
      </div>

      <div v-show="mixinState.mSelectMode === 'one'" class="attr-item-box">
        <!-- 分组 -->
        <Group></Group>
        <!-- 位置信息 -->
        <AttributePostion></AttributePostion>
        <!-- 显示：textbox 用专用尺寸面板，其它类型用通用面板（v-show 保持常驻，避免错过选择事件） -->
        <AttributeDisplay v-show="mixinState.mSelectOneType !== 'textbox'"></AttributeDisplay>
        <AttributeDisplayText
          v-show="mixinState.mSelectOneType === 'textbox'"
        ></AttributeDisplayText>
        <!-- 网络图片地址回显与编辑 -->
        <AttributeOnlineImg />
        <!-- 图片操作分组：替换图片 / 裁剪 / 图片裁切
             ⚠ 坑：此插槽内的 replaceImg/cropperImg/clipImage 通过自身监听 canvasEditor.selectOne 事件
             获取当前选中图片类型（type），而非由父组件传值。因此它们必须常驻挂载才能收到事件。
             AttrSection 的 :show 依赖内部 v-show（而非 v-if）实现，切不可把 AttrSection 改为 v-if 卸载子树，
             否则子组件会错过已派发过的 selectOne 事件、初始化不到选中类型，表现为只剩空灰底、按钮不渲染。
             同理，在此插槽内放置其它「自监听事件」的子组件时，也应保持常驻（v-show），勿用 v-if 卸载。 -->
        <AttrSection
          :title="$t('imageOps')"
          :show="mixinState.mSelectOneType === 'image'"
          style="padding-bottom: 6px"
        >
          <div class="bg-item">
            <!-- 在线图片（含网络图片、变量图片）不展示"替换图片" -->
            <ReplaceImg v-show="imageType === 'normal'"></ReplaceImg>
            <!-- online 网络图片 / variable 变量图片不展示"裁剪"：裁剪会把对象 src
                 替换为 base64（getCropData 产物），网络图将丢失原 URL、CDN 分片缓存失效，
                 且导出 JSON 被 base64 撑爆 -->
            <CropperImg v-show="imageType === 'normal'"></CropperImg>
            <ClipImage></ClipImage>
          </div>
        </AttrSection>
        <!-- 条形码属性 -->
        <AttributeBarcode></AttributeBarcode>
        <!-- 二维码 -->
        <AttributeQrCode></AttributeQrCode>
        <!-- 图片滤镜 -->
        <Filters></Filters>
        <!-- 图片描边 -->
        <ImgStroke />
        <!-- 颜色 -->
        <AttributeColor></AttributeColor>
        <!-- 图层模式（混合模式） -->
        <AttributeBlend></AttributeBlend>
        <!-- 字体属性 -->
        <AttributeFont></AttributeFont>
        <!-- 字体小数点 -->
        <AttributeTextFloat></AttributeTextFloat>
        <!-- 文字内容  -->
        <AttributeTextContent></AttributeTextContent>
        <!-- 阴影 -->
        <AttributeShadow></AttributeShadow>
        <!-- 边框 -->
        <AttributeBorder></AttributeBorder>
        <!-- 圆角 -->
        <AttributeRounded></AttributeRounded>
        <!-- 关联数据 -->
        <AttributeId></AttributeId>

        <div>
          <Button size="small" @click="canvasEditor.getFontJson()">获取元素数据</Button>
          <Button size="small" style="margin-left: 14px" @click="copyElementJson">
            复制元素数据
          </Button>
        </div>
      </div>

      <!-- 裁切精准设置：裁切 shell 选中时展示（X/Y/W/H 滑杆角度，相对图片）。
           独立于常规选中面板容器：裁切会话里裁切 shell 会被 useSelectListen 判空（空态），
           放进容器内会被 v-show 一并隐藏，故外挂、由组件自主判定可见性 -->
      <AttributeClip></AttributeClip>
    </div>

    <!-- 右侧关闭按钮 -->
    <div
      :class="`close-btn right-btn ${attrBarShow && 'right-btn-open'}`"
      @click="switchAttrBar"
    ></div>
  </div>
</template>

<style lang="less" scoped>
// 右侧容器
.right-bar {
  width: 304px;
  height: 100%;
  padding: 10px;
  overflow-y: auto;
  background: #fff;
}

// 快捷操作工具栏：10 个按钮均为 .bg-item 的直接 flex 子项，flex:1 严格等宽
.bg-item {
  align-items: center;

  // 统一按钮内边距与图标大小：前几个 icon 字体按钮随 font-size 放大，SVG 按钮用大尺寸图标
  /deep/ .ivu-btn {
    padding: 0;
    font-size: 18px;
  }

  /deep/ .ivu-tooltip,
  /deep/ .ivu-dropdown {
    flex: 1 1 0;
    min-width: 0;
  }

  /deep/ .ivu-divider-vertical {
    flex-shrink: 0;
    height: 20px;
    margin: 0 3px;
    background: #d8d8d8;
    top: 1px;
  }
}

// 属性面板样式
::v-deep .attr-item {
  position: relative;
  margin-bottom: 12px;
  height: 40px;
  padding: 0 10px;
  background: #f6f7f9;
  border: none;
  border-radius: 4px;
  display: flex;
  align-items: center;
  .ivu-tooltip {
    text-align: center;
    flex: 1;
  }
}

// 关闭按钮
.close-btn {
  width: 27px;
  height: 70px;
  cursor: pointer;
  background-image: url('~@/assets/icon/side_close.png');
  background-repeat: no-repeat;
  background-size: cover;
  background-position: 50%;
  position: absolute;
  right: -20px;
  z-index: 2;
  top: 50%;
  margin-top: -10px;

  &.right-btn {
    background-image: url('~@/assets/icon/side_close_right.png');
    transform: rotateY(180deg);
    right: 0px;
  }

  &.right-btn-open {
    background-image: url('~@/assets/icon/side_close.png');
    right: 303px;
  }
}
</style>
