<!--
 * @Author: 秦少卫
 * @Date: 2022-04-21 20:20:20
 * @LastEditors: 秦少卫
 * @LastEditTime: 2023-08-05 18:44:54
 * @Description: 缩放元素
-->
<template>
  <div class="box">
    <ButtonGroup>
      <Button @click="big">
        <BigIcon width="14" height="14"></BigIcon>
      </Button>
      <Button @click="small">
        <SmallIcon width="14" height="14"></SmallIcon>
      </Button>
      <Button icon="ios-expand" @click="rSet"></Button>
      <Button icon="md-contract" @click="setViewport"></Button>
    </ButtonGroup>
  </div>
</template>

<script>
import useSelect from '@/hooks/select';
import BigIcon from '@/assets/icon/zoom/big.svg';
import SmallIcon from '@/assets/icon/zoom/small.svg';

export default {
  name: 'Zoom',
  components: { BigIcon, SmallIcon },
  setup() {
    const { canvasEditor } = useSelect();

    const rSet = () => {
      canvasEditor.one();
    };
    const big = () => {
      canvasEditor.big();
    };
    const small = () => {
      canvasEditor.small();
    };
    const setViewport = () => {
      canvasEditor.auto();
    };

    return {
      big,
      small,
      rSet,
      setViewport,
    };
  },
};
</script>
<style scoped lang="less">
.box {
  position: absolute;
  right: 10px;
  bottom: 10px;

  /deep/ .ivu-btn:hover {
    svg {
      fill: #57a3f3;
    }
  }
}
</style>
