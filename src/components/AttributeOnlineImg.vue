<!--
 * @Author: cyc
 * @Date: 2026-08-27 11:05:16
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 网络图片属性面板
-->

<template>
  <div v-if="isOne && isMatchType && isOnlineImg" class="box attr-item-box">
    <Divider plain orientation="left">
      <h4>{{ t('attributes.online_image_url') }}</h4>
    </Divider>
    <Input
      v-model="baseAttr.url"
      :placeholder="t('insertFile.insert_online_image_placeholder')"
      @on-enter="saveUrl"
    />
  </div>
</template>

<script>
import {
  reactive,
  ref,
  getCurrentInstance,
  onMounted,
  onBeforeUnmount,
} from '@vue/composition-api';
import useSelect from '@/hooks/select';
import { Message } from 'view-design';

export default {
  name: 'AttributeOnlineImg',
  setup() {
    const update = getCurrentInstance();
    const { isOne, isMatchType, canvasEditor, t } = useSelect(['image']);

    // 是否为网络图片（src 为 http/https 地址，而非 base64）
    const isOnlineImg = ref(false);

    // 属性值
    const baseAttr = reactive({
      url: '',
    });

    const isOnlineUrl = (src) => typeof src === 'string' && /^https?:\/\/.+$/i.test(src);

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      isOnlineImg.value = false;
      baseAttr.url = '';
      if (activeObject && activeObject.type === 'image' && activeObject.getSrc) {
        const src = activeObject.getSrc();
        if (isOnlineUrl(src)) {
          isOnlineImg.value = true;
          baseAttr.url = src;
        }
      }
      update?.proxy?.$forceUpdate();
    };

    // 保存新的图片地址：以 anonymous 重新加载，保持原宽高比例
    const saveUrl = () => {
      const url = (baseAttr.url || '').trim();
      if (!url) {
        Message.error(t('insertFile.insert_online_image_empty'));
        return;
      }
      if (!isOnlineUrl(url)) {
        Message.error(t('insertFile.insert_online_image_invalid'));
        return;
      }
      const activeObject = canvasEditor.canvas.getActiveObject();
      if (!activeObject || activeObject.getSrc() === url) return;
      const width = activeObject.get('width');
      const height = activeObject.get('height');
      const scaleX = activeObject.get('scaleX');
      const scaleY = activeObject.get('scaleY');
      activeObject.setSrc(
        url,
        (img, isError) => {
          if (isError) {
            Message.error(t('insertFile.insert_online_image_error'));
            return;
          }
          img.set('scaleX', (width * scaleX) / img.width);
          img.set('scaleY', (height * scaleY) / img.height);
          baseAttr.url = img.getSrc();
          canvasEditor.canvas.renderAll();
          Message.success(t('attributes.apply_success'));
        },
        { crossOrigin: 'anonymous' }
      );
    };

    const selectCancel = () => {
      isOnlineImg.value = false;
      baseAttr.url = '';
      update?.proxy?.$forceUpdate();
    };

    onMounted(() => {
      getObjectAttr();
      canvasEditor.on('selectCancel', selectCancel);
      canvasEditor.on('selectOne', getObjectAttr);
      canvasEditor.canvas.on('object:modified', getObjectAttr);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectCancel', selectCancel);
      canvasEditor.off('selectOne', getObjectAttr);
      canvasEditor.canvas.off('object:modified', getObjectAttr);
    });

    return {
      isOne,
      isMatchType,
      isOnlineImg,
      baseAttr,
      saveUrl,
      t,
    };
  },
};
</script>
