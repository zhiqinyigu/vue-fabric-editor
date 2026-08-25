<script>
import { inject, ref } from '@vue/composition-api';
import CenterAlign from '@/components/centerAlign.vue';
import Flip from '@/components/flip.vue';

import Clone from '@/components/clone.vue';
import Dele from '@/components/del.vue';
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

// 右侧组件
import AttributePostion from '@/components/AttributePostion.vue';
import AttributeDisplay from '@/components/AttributeDisplay.vue';
import AttributeId from '@/components/AttributeId.vue';
import AttributeShadow from '@/components/AttributeShadow.vue';
import AttributeBorder from '@/components/AttributeBorder.vue';
import AttributeRounded from '@/components/AttributeRounded.vue';
import AttributeFont from '@/components/AttributeFont.vue';
import AttributeTextFloat from '@/components/AttributeTextFloat.vue';
import AttributeColor from '@/components/AttributeColor.vue';
import AttributeBarcode from '@/components/AttributeBarcode.vue';
import AttributeQrCode from '@/components/AttributeQrCode.vue';
import AttributeTextContent from '@/components/AttributeTextContent.vue';
import ClipImage from '@/components/ClipImage.vue';
import CropperImg from '@/components/CropperImg.vue';
// hooks
import useSelectListen from '@/hooks/useSelectListen';
import { Message } from 'view-design';

export default {
  name: 'Right',
  components: {
    Align,
    CenterAlign,
    Flip,
    Clone,
    Hide,
    Group,
    Lock,
    Dele,
    Edit,
    BgBar,
    SetSize,
    ReplaceImg,
    Filters,
    ImgStroke,
    AttributePostion,
    AttributeDisplay,
    AttributeId,
    AttributeShadow,
    AttributeBorder,
    AttributeRounded,
    AttributeFont,
    AttributeTextFloat,
    AttributeColor,
    AttributeBarcode,
    AttributeQrCode,
    AttributeTextContent,
    ClipImage,
    CropperImg,
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

    // 属性面板开关
    const switchAttrBar = () => {
      attrBarShow.value = !attrBarShow.value;
    };

    return {
      canvasEditor,
      mixinState,
      attrBarShow,
      switchAttrBar,
      copyElementJson,
    };
  },
};
</script>

<template>
  <div style="display: contents">
    <!-- 属性区域 380-->
    <div v-show="attrBarShow" class="right-bar">
      <div style="padding-top: 10px">
        <!-- 未选择元素时 展示背景设置 -->
        <div v-show="!mixinState.mSelectMode">
          <SetSize></SetSize>
          <BgBar></BgBar>
        </div>

        <!-- 多选时展示 -->
        <div v-show="mixinState.mSelectMode === 'multiple'">
          <!-- 分组 -->
          <Group></Group>
          <Align></Align>
          <!-- 居中对齐 -->
          <CenterAlign></CenterAlign>
        </div>

        <div v-show="mixinState.mSelectMode === 'one'" class="attr-item-box">
          <!-- 分组 -->
          <Group></Group>
          <Divider plain orientation="left">
            <h4>快捷操作</h4>
          </Divider>
          <div v-show="mixinState.mSelectMode" class="bg-item">
            <Lock></Lock>
            <Dele></Dele>
            <Clone></Clone>
            <Hide></Hide>
            <Edit></Edit>
          </div>
          <!-- 位置信息 -->
          <AttributePostion></AttributePostion>
          <!-- 显示 -->
          <AttributeDisplay></AttributeDisplay>
          <!-- 居中对齐 -->
          <CenterAlign></CenterAlign>
          <!-- 替换图片 -->
          <ReplaceImg></ReplaceImg>
          <!-- 裁剪 -->
          <CropperImg></CropperImg>
          <!-- 图片裁切 -->
          <ClipImage></ClipImage>
          <!-- 翻转 -->
          <Flip></Flip>
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
      </div>
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
