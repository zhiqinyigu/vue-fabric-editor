<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:26:59
 * @Description: 组合元素对齐
-->

<template>
  <AttrSection v-if="isMultiple" title="对齐">
    <div class="bg-item">
      <!-- 水平对齐 -->
      <Tooltip :content="$t('attrSeting.align.left')">
        <Button size="small" type="text" @click="left">
          <LeftIcon />
        </Button>
      </Tooltip>
      <Tooltip :content="$t('attrSeting.align.centerX')">
        <Button size="small" type="text" @click="xcenter">
          <CenterxIcon />
        </Button>
      </Tooltip>
      <Tooltip :content="$t('attrSeting.align.right')">
        <Button size="small" type="text" @click="right">
          <RightIcon />
        </Button>
      </Tooltip>
      <!-- 垂直对齐 -->
      <Tooltip :content="$t('attrSeting.align.top')">
        <Button size="small" type="text" @click="top">
          <TopIcon />
        </Button>
      </Tooltip>
      <Tooltip :content="$t('attrSeting.align.centerY')">
        <Button size="small" type="text" @click="ycenter">
          <CenteryIcon />
        </Button>
      </Tooltip>
      <Tooltip :content="$t('attrSeting.align.bottom')">
        <Button size="small" type="text" @click="bottom">
          <BottomIcon />
        </Button>
      </Tooltip>
      <!-- 平均对齐 -->
      <Tooltip :content="$t('attrSeting.align.averageX')">
        <Button size="small" type="text" @click="xequation">
          <SxIcon />
        </Button>
      </Tooltip>
      <Tooltip :content="$t('attrSeting.align.averageY')">
        <Button size="small" type="text" @click="yequation">
          <SyIcon />
        </Button>
      </Tooltip>
    </div>
  </AttrSection>
</template>

<script>
import useSelect from '@/hooks/select';
import AttrSection from '@/components/attrPanel/AttrSection.vue';

import LeftIcon from '@/assets/icon/left.svg';
import RightIcon from '@/assets/icon/right.svg';

import TopIcon from '@/assets/icon/top.svg';
import BottomIcon from '@/assets/icon/bottom.svg';

import SxIcon from '@/assets/icon/sx.svg';
import SyIcon from '@/assets/icon/sy.svg';

import CenterxIcon from '@/assets/icon/centerx.svg';
import CenteryIcon from '@/assets/icon/centery.svg';

export default {
  name: 'Align',
  components: {
    AttrSection,
    LeftIcon,
    RightIcon,
    TopIcon,
    BottomIcon,
    SxIcon,
    SyIcon,
    CenterxIcon,
    CenteryIcon,
  },
  setup() {
    const { canvasEditor, isMultiple } = useSelect();

    // 左对齐
    const left = () => {
      canvasEditor.left();
    };
    // 右对齐
    const right = () => {
      canvasEditor.right();
    };
    // 水平居中对齐
    const xcenter = () => {
      canvasEditor.xcenter();
    };
    // 垂直居中对齐
    const ycenter = () => {
      canvasEditor.ycenter();
    };
    // 顶部对齐
    const top = () => {
      canvasEditor.top();
    };
    // 底部对齐
    const bottom = () => {
      canvasEditor.bottom();
    };
    // 水平平均对齐
    const xequation = () => {
      canvasEditor.xequation();
    };
    // 垂直平均对齐
    const yequation = () => {
      canvasEditor.yequation();
    };

    return {
      isMultiple,
      left,
      right,
      xcenter,
      ycenter,
      top,
      bottom,
      xequation,
      yequation,
    };
  },
};
</script>

<style scoped lang="less">
.icon {
  width: 100%;
  height: auto;
}
</style>
