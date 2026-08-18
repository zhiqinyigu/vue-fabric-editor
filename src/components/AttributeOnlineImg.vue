<!--
 * @Author: cyc
 * @Date: 2026-08-27 11:05:16
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 网络图片属性面板
-->

<template>
  <AttrSection v-if="isOne && isMatchType && isOnlineImg" :title="t('attributes.online_image_url')">
    <AttrField editable>
      <Input
        v-model="baseAttr.url"
        :placeholder="t('insertFile.insert_online_image_placeholder')"
        @on-change="onUrlChange"
        @on-enter="flushUrlChange"
        @on-blur="flushUrlChange"
      />
    </AttrField>
  </AttrSection>
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
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';

export default {
  name: 'AttributeOnlineImg',
  components: {
    AttrSection,
    AttrField,
  },
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

    // 变量插件（判断 URL 是否含变量包裹符 / 就地更新变量图片地址）
    const getVariablePlugin = () => canvasEditor.getPlugin?.('VariablePlugin') || null;
    // 是否为变量图片：对象标记了 isVariableImage，或 src 含变量（如 https://xxx/{{id}}.png、{{imgUrl}}）
    const isVariableImage = (obj, src) => {
      if (!obj || typeof src !== 'string') return false;
      if (obj.get('isVariableImage') === true) return true;
      const vp = getVariablePlugin();
      return !!(vp && vp.containsVariable && vp.containsVariable(src));
    };

    // 实时保存（防抖，避免逐字输入时反复发起图片加载）
    const URL_DEBOUNCE = 500;
    let urlTimer = null;
    const clearUrlTimer = () => {
      if (urlTimer) {
        clearTimeout(urlTimer);
        urlTimer = null;
      }
    };
    // 输入中：静默应用（未输入完的非法地址不弹提示），由防抖收敛
    const onUrlChange = () => {
      clearUrlTimer();
      urlTimer = setTimeout(() => {
        urlTimer = null;
        saveUrl({ silent: true });
      }, URL_DEBOUNCE);
    };
    // 回车 / 失焦：立即应用并给出校验提示
    const flushUrlChange = () => {
      clearUrlTimer();
      saveUrl();
    };

    // 属性获取
    const getObjectAttr = (e) => {
      // 切换选中对象时丢弃未落地的输入，避免把旧地址写到新对象上
      clearUrlTimer();
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      isOnlineImg.value = false;
      baseAttr.url = '';
      if (activeObject && activeObject.type === 'image' && activeObject.getSrc) {
        const src = activeObject.getSrc();
        // 网络图片与变量图片（含 {{var}} 的地址）都展示地址输入框供编辑
        if (isOnlineUrl(src) || isVariableImage(activeObject, src)) {
          isOnlineImg.value = true;
          baseAttr.url = src;
        }
      }
      update?.proxy?.$forceUpdate();
    };

    // 保存新的图片地址：以 anonymous 重新加载，保持原宽高比例；变量 URL 走变量插件重建占位图
    const saveUrl = ({ silent = false } = {}) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 无选中图片时无可应用对象（典型场景：点击空白画布取消选中 → selectCancel 先清空
      // baseAttr.url → 输入框 blur 才触发本函数）。此时静默退出，避免误报“请输入在线图片地址”
      if (!activeObject || !activeObject.getSrc) return;

      const url = (baseAttr.url || '').trim();
      if (!url) {
        if (!silent) Message.error(t('insertFile.insert_online_image_empty'));
        return;
      }
      const vp = getVariablePlugin();
      const isVariableUrl = !!(vp && vp.containsVariable && vp.containsVariable(url));
      // 变量 URL（含 {{var}} 包裹符）合法；其余要求为 http/https 地址
      if (!isOnlineUrl(url) && !isVariableUrl) {
        if (!silent) Message.error(t('insertFile.insert_online_image_invalid'));
        return;
      }
      if (activeObject.getSrc() === url) return;

      // 变量地址：更新 src 并重建占位图（或由普通图转为变量图）
      if (isVariableUrl) {
        const applyVariable = () => {
          if (vp && vp.updateVariableImage) {
            vp.updateVariableImage(activeObject, url)
              .then(() => {
                baseAttr.url = url;
                canvasEditor.canvas.renderAll();
                Message.success(t('attributes.apply_success'));
              })
              .catch(() => Message.error(t('insertFile.insert_online_image_error')));
          } else {
            // 插件缺失兜底：仅更新存储态 src
            activeObject.set('src', url);
            activeObject.set('isVariableImage', true);
            canvasEditor.canvas.renderAll();
            baseAttr.url = url;
            Message.success(t('attributes.apply_success'));
          }
        };
        applyVariable();
        return;
      }

      // 普通网络图片：以 anonymous 重新加载，保持原宽高比例
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
          // 清除变量标记（由变量图片改为普通图片时）
          img.set('isVariableImage', false);
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
      clearUrlTimer();
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
      onUrlChange,
      flushUrlChange,
      t,
    };
  },
};
</script>
