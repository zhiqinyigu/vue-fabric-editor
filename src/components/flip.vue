<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-13 17:14:52
 * @Description: 元素翻转
-->

<template>
  <div v-if="isOne" class="attr-item-box">
    <!-- <h3>{{ $t('attrSeting.flip.name') }}</h3> -->
    <!-- <Divider plain orientation="left">
      <h4>{{ $t('attrSeting.flip.name') }}</h4>
    </Divider> -->
    <div class="bg-item">
      <Tooltip :content="$t('attrSeting.flip.x')">
        <Button long type="text" @click="flip('X')">
          <flipX width="14" height="14"></flipX>
        </Button>
      </Tooltip>
      <Tooltip :content="$t('attrSeting.flip.y')">
        <Button long type="text" @click="flip('Y')">
          <flipY width="14" height="14"></flipY>
        </Button>
      </Tooltip>
    </div>

    <!-- <Divider plain></Divider> -->
  </div>
</template>

<script>
import useSelect from '@/hooks/select';
import flipX from '@/assets/icon/flip/x.svg';
import flipY from '@/assets/icon/flip/y.svg';

export default {
  name: 'Flip',
  components: {
    flipX,
    flipY,
  },
  setup() {
    const { isOne, canvasEditor } = useSelect();

    const flip = (type) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      activeObject.set(`flip${type}`, !activeObject[`flip${type}`]).setCoords();
      canvasEditor.canvas.requestRenderAll();
    };

    return {
      isOne,
      flip,
    };
  },
};
</script>

<style scoped lang="less">
/deep/ .ivu-btn {
  &[disabled] {
    svg {
      opacity: 0.2;
    }
  }
}

.attr-item-box {
  margin-top: 8px;
}
</style>
