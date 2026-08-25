<!--
 * @Author: 秦少卫
 * @Date: 2024-05-21 09:53:33
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:33:27
 * @Description: file content
-->

<template>
  <AttrSection v-if="isOne" title="数据">
    <div class="form-wrap">
      <AttrField :label="$t('attributes.id')" :label-width="40">
        <Input v-model="baseAttr.id" @on-change="changeCommon('id', baseAttr.id)"></Input>
      </AttrField>
    </div>

    <!-- 跟随增高对象：锚点为 autoGrow 文本，渲染真实数据时保持相对间距跟随下移 -->
    <div class="form-wrap">
      <AttrField :label="$t('attributes.follow')" :label-width="90">
        <Select
          v-model="baseAttr.follow"
          filterable
          clearable
          :placeholder="$t('attributes.followNone')"
          @on-change="changeFollow"
        >
          <Option v-for="anchor in anchors" :key="anchor.id" :value="anchor.id">
            {{ anchor.name }}
          </Option>
        </Select>
      </AttrField>
    </div>
  </AttrSection>
</template>

<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';

export default {
  name: 'AttrBute',
  components: {
    AttrSection,
    AttrField,
  },
  setup() {
    const update = getCurrentInstance();
    const { canvasEditor, isOne } = useSelect();

    // 属性值
    const baseAttr = reactive({
      id: 0,
      follow: null,
    });
    // 可跟随的锚点列表（autoGrow 文本，排除自身）
    const anchors = reactive([]);

    // 刷新锚点列表
    const refreshAnchors = (excludeId) => {
      anchors.splice(0, anchors.length);
      const growPlugin = canvasEditor.getPlugin('AutoGrowPlugin');
      if (!growPlugin || !growPlugin.getAnchors) return;
      growPlugin
        .getAnchors()
        .filter((a) => a.id !== excludeId)
        .forEach((a) => anchors.push(a));
    };

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject) {
        baseAttr.id = activeObject.get('id');
        baseAttr.follow = activeObject.get('follow') || null;
        refreshAnchors(activeObject.id);
      }
    };

    // 通用属性改变
    const changeCommon = (key, value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject && activeObject.set(key, value);
        canvasEditor.canvas.renderAll();
      }
    };

    // 跟随增高对象
    const changeFollow = (value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (!activeObject) return;
      const growPlugin = canvasEditor.getPlugin('AutoGrowPlugin');
      if (growPlugin && growPlugin.setFollow) {
        growPlugin.setFollow(activeObject, value);
      } else {
        activeObject.set('follow', value || undefined);
        canvasEditor.canvas.renderAll();
      }
      baseAttr.follow = value || null;
    };

    const selectCancel = () => {
      baseAttr.follow = null;
      anchors.splice(0, anchors.length);
      update && update.proxy && update.proxy.$forceUpdate();
    };

    onMounted(() => {
      // 获取字体数据
      getObjectAttr();
      canvasEditor.on('selectCancel', selectCancel);
      canvasEditor.on('selectOne', getObjectAttr);
      canvasEditor.on('autoGrow:change', getObjectAttr);
      canvasEditor.canvas.on('object:modified', getObjectAttr);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectCancel', selectCancel);
      canvasEditor.off('selectOne', getObjectAttr);
      canvasEditor.off('autoGrow:change', getObjectAttr);
      canvasEditor.canvas.off('object:modified', getObjectAttr);
    });

    return {
      isOne,
      baseAttr,
      anchors,
      changeCommon,
      changeFollow,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';

.form-wrap {
  margin-bottom: 0;
}
</style>
