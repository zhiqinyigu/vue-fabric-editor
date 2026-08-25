<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:39:38
 * @Description: 多元素或单元素对齐方式
-->

<template>
  <div v-if="isSelect" class="attr-item-box">
    <!-- <h3>{{ $t('attrSeting.centerAlign.name') }}</h3> -->
    <Divider plain orientation="left">
      <h4>{{ $t('attrSeting.centerAlign.name') }}</h4>
    </Divider>
    <div class="bg-item">
      <!-- 水平集中 -->
      <Tooltip :content="$t('attrSeting.centerAlign.centerX')">
        <Button long type="text" @click="position('centerH')">
          <centerX width="14" height="14"></centerX>
        </Button>
      </Tooltip>
      <!-- 水平垂直居中 -->
      <Tooltip :content="$t('attrSeting.centerAlign.center')">
        <Button long type="text" @click="position('center')">
          <centerIcon width="14" height="14"></centerIcon>
        </Button>
      </Tooltip>
      <!-- 垂直居中 -->
      <Tooltip :content="$t('attrSeting.centerAlign.centerY')">
        <Button long type="text" @click="position('centerV')">
          <centerY width="14" height="14"></centerY>
        </Button>
      </Tooltip>
    </div>
    <!-- <Divider plain></Divider> -->
  </div>
</template>

<script>
import useSelect from '@/hooks/select';
import centerIcon from '@/assets/icon/centerAlign/center.svg';
import centerX from '@/assets/icon/centerAlign/centerX.svg';
import centerY from '@/assets/icon/centerAlign/centerY.svg';

export default {
  name: 'CenterAlign',
  components: {
    centerIcon,
    centerX,
    centerY,
  },
  setup() {
    const { isSelect, canvasEditor } = useSelect();

    const position = (name) => {
      canvasEditor.position(name);
    };

    return {
      isSelect,
      position,
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
svg {
  vertical-align: text-bottom;
}
</style>
