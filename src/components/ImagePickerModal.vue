<!--
 * @Author: cyc
 * @Date: 2026-08-27 11:05:16
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * 统一图片来源选择器弹窗（挂载于 home 根节点，供 tools / bgBar 共用）
 * - 本地图片 Tab：选择本地图片转 base64
 * - 在线图片 Tab：URL 输入（右侧嵌入"上传到CDN"按钮，注册 asset 适配器后显示）
 * 通过 useImagePicker 的 openImagePicker({ mode, onDone }) 打开；onDone 决定最终去向。
 -->
<template>
  <Modal
    v-model="pickerState.open"
    :title="modalTitle"
    :width="480"
    @on-ok="confirm"
    @on-cancel="onCancel"
  >
    <Tabs v-model="activeTab">
      <!-- 本地图片（远程模式隐藏，禁止本地转base64） -->
      <TabPane v-if="!remoteImageMode" :label="$t('insertFile.insert_local_image')" name="local">
        <div
          class="local-upload"
          :class="{ 'is-dragover': dragging }"
          @click="triggerLocalPicker"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onLocalDrop"
        >
          <div class="local-tip">
            <Icon type="ios-cloud-upload-outline" size="34" />
            <span>{{ $t('insertFile.insert_local_image_btn') }}</span>
            <em>{{ $t('insertFile.insert_local_image_drop_hint') }}</em>
          </div>
          <input
            ref="localInput"
            type="file"
            accept="image/*"
            multiple
            style="display: none"
            @change="onLocalChange"
          />
        </div>
      </TabPane>

      <!-- 在线图片（URL + CDN上传回填） -->
      <TabPane :label="$t('insertFile.insert_online_image_url')" name="url">
        <div class="online-img-row">
          <Input
            ref="urlInput"
            :key="varSchemaAvailable ? 'vip' : 'plain'"
            v-model="url"
            :placeholder="$t('insertFile.insert_online_image_placeholder')"
            @on-enter="confirm"
          >
            <template v-if="varSchemaAvailable" #append>
              <VariableInsertPopover filter-type="image" @select="insertVariable" />
            </template>
          </Input>
          <Upload
            v-if="hasAsset"
            :before-upload="handleUpload"
            :show-upload-list="false"
            action=""
            accept="image/*"
          >
            <Button icon="ios-cloud-upload-outline">
              {{ $t('insertFile.insert_online_image_upload_btn') }}
            </Button>
          </Upload>
        </div>
      </TabPane>
    </Tabs>

    <div v-if="activeTab === 'url' && !remoteImageMode" class="online-img-option">
      <Checkbox v-model="convertToLocal">
        {{ $t('insertFile.insert_online_image_convert') }}
      </Checkbox>
      <span class="online-img-tip">{{ $t('insertFile.insert_online_image_convert_tip') }}</span>
    </div>
  </Modal>
</template>

<script>
import { ref, computed, watch, nextTick } from '@vue/composition-api';
import { Message } from 'view-design';
import useImagePicker from '@/hooks/useImagePicker';
import { useEditorContext } from '@/hooks/useEditorContext';
import useSelect from '@/hooks/select';
import { useI18n } from '@/hooks/useI18n';
import VariableInsertPopover from './VariableInsertPopover.vue';
import { insertAtCursor, getInputElement, focusCaret } from '@/utils/cursorInsert';
import { normalizeAssetUrl } from '@/core/assetUrl';

// 将在线图片转为本地 base64（drawImage 到临时 canvas 后 toDataURL）
function urlToBase64(url) {
  return new Promise((resolve, reject) => {
    const imgEl = document.createElement('img');
    imgEl.crossOrigin = 'anonymous';
    imgEl.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    imgEl.onerror = () => reject(new Error('image load failed'));
    imgEl.src = url;
  });
}

export default {
  name: 'ImagePickerModal',
  components: {
    VariableInsertPopover,
  },
  setup() {
    const { pickerState, closeImagePicker } = useImagePicker();
    const { registry, remoteImageMode } = useEditorContext();
    const { canvasEditor } = useSelect();
    const { t } = useI18n();
    const $t = (key) => t(key);
    // 变量表可用性：append 槽位级守卫（无 schema 时不渲染插入变量入口）。
    // 本弹窗挂载早于编辑器初始化（adapter 注入在编辑器 onMounted），setup 时判定必为 false，
    // 故在打开时再判定一次（adapter 注入后属静态事实，无需响应式追踪）
    // 变量表可用性：append 槽位级守卫（无 schema 时不渲染插入变量入口）。
    // 本弹窗挂载早于编辑器初始化（adapter 注入在编辑器 onMounted），setup 时判定必为 false，
    // 故在打开时再判定一次（adapter 注入后属静态事实，无需响应式追踪）。
    // 注：view-design Input 的 append 盒由 $slots.append 非响应式 computed 门控，
    // 槽位后出现不会触发重渲染，需以 :key 重挂载 Input 让 append 盒按新槽位重建
    const varSchemaAvailable = ref(false);

    const activeTab = ref(remoteImageMode ? 'url' : 'local');
    const url = ref('');
    const convertToLocal = ref(false);
    const localInput = ref(null);
    const dragging = ref(false);

    const asset = registry.get('asset');
    const hasAsset = computed(() => !!asset && typeof asset.uploadImage === 'function');

    const modalTitle = computed(() =>
      pickerState.mode === 'background' ? $t('bgSeting.image') : $t('insertFile.insert_picture')
    );

    // 每次打开重置输入状态，并回显当前图片地址（在线 URL / 变量）
    watch(
      () => pickerState.open,
      (v) => {
        if (v) {
          varSchemaAvailable.value = !!(
            canvasEditor.getSchemaAdapter && canvasEditor.getSchemaAdapter()
          );
          resetInputs();
        }
      }
    );

    const resetInputs = () => {
      activeTab.value = remoteImageMode ? 'url' : 'local';
      url.value = '';
      convertToLocal.value = false;
      const current = getCurrentSrc();
      if (current) {
        url.value = current;
        activeTab.value = 'url';
      }
    };
    // 取"当前编辑对象"的在线地址/变量 src 用于回显：
    // - 背景模式：读 WorkspacePlugin.getBackgroundImage
    // - 插入/更换元素：读当前选中图片对象（getSrc 对变量图返回变量 URL）
    const getCurrentSrc = () => {
      try {
        if (pickerState.mode === 'background') {
          const info = canvasEditor.getBackgroundImage && canvasEditor.getBackgroundImage();
          const src = info && info.src;
          return isValidPrefill(src) ? src : '';
        }
        const active = canvasEditor.canvas && canvasEditor.canvas.getActiveObject();
        if (active && active.type === 'image' && active.getSrc) {
          const src = active.getSrc();
          return isValidPrefill(src) ? src : '';
        }
      } catch (e) {
        // 忽略取值异常（如无选中对象）
      }
      return '';
    };
    // 仅回显 http(s) / 变量占位 URL；data:/blob: 本地图不回显
    const isValidPrefill = (src) => {
      if (typeof src !== 'string' || !src) return false;
      if (/^data:/i.test(src) || /^blob:/i.test(src)) return false;
      if (/^(https?:)?\/\//i.test(src)) return true;
      return !!(canvasEditor.containsVariable && canvasEditor.containsVariable(src));
    };

    // ===== 结果分发与关闭 =====
    const runDone = (src, meta) => {
      if (typeof pickerState.onDone === 'function') {
        pickerState.onDone(src, meta);
      }
    };
    const finish = () => {
      resetInputs();
      closeImagePicker();
    };

    // ===== 本地图片（选中后直接插入，无需点击确定） =====
    const triggerLocalPicker = () => {
      localInput.value && localInput.value.click();
    };
    const addLocalFiles = (files) => {
      // 远程图片模式下禁用本地图片（禁止本地 base64 入库）
      if (remoteImageMode) {
        Message.error($t('insertFile.insert_online_image_remote_only'));
        return;
      }
      const images = Array.from(files || []).filter((f) => f.type && f.type.startsWith('image/'));
      if (images.length === 0) return;
      if (pickerState.mode === 'background') {
        // 背景模式仅取第一张并立即应用
        const reader = new FileReader();
        reader.onload = () => {
          runDone(reader.result, { local: true });
          finish();
        };
        reader.readAsDataURL(images[0]);
      } else {
        // 插入模式：逐张插入，最后一张读取完成后关闭
        let remaining = images.length;
        images.forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            runDone(reader.result, { local: true });
            remaining -= 1;
            if (remaining === 0) finish();
          };
          reader.readAsDataURL(file);
        });
      }
    };
    const onLocalChange = (e) => {
      addLocalFiles(e.target.files);
      e.target.value = '';
    };
    const onLocalDrop = (e) => {
      dragging.value = false;
      addLocalFiles(e.dataTransfer && e.dataTransfer.files);
    };

    // ===== CDN 上传 =====
    const handleUpload = async (file) => {
      if (!asset || typeof asset.uploadImage !== 'function') return false;
      try {
        const { url: uploadedUrl } = await asset.uploadImage(file);
        url.value = uploadedUrl || '';
        activeTab.value = 'url';
        Message.success($t('insertFile.insert_online_image_upload_success'));
      } catch (e) {
        Message.error(e.message || $t('insertFile.insert_online_image_upload_error'));
      }
      return false; // 阻止默认上传
    };

    // 在线URL确认
    const confirmUrl = async () => {
      const src = url.value.trim();
      if (!src) {
        Message.error($t('insertFile.insert_online_image_empty'));
        return;
      }
      // 变量 URL（含 {{var}} 包裹符）合法，无需 http:// 前缀（与 AttributeOnlineImg 行为一致）
      const isVariableUrl = !!(canvasEditor.containsVariable && canvasEditor.containsVariable(src));
      if (!isVariableUrl && !/^https?:\/\/.+$/i.test(src)) {
        Message.error($t('insertFile.insert_online_image_invalid'));
        return;
      }
      // 变量 URL：插入元素创建占位图；背景走 onDone 由 BgBar 分流到 setBackgroundVariableImage
      if (isVariableUrl) {
        Message.info($t('variable.url_is_dynamic'));
        if (convertToLocal.value) {
          Message.warning($t('variable.cannot_convert_local'));
          convertToLocal.value = false;
        }
        if (pickerState.mode === 'background') {
          runDone(src, { variable: true });
          resetInputs();
          closeImagePicker();
          return;
        }
        try {
          const imgItem = await canvasEditor.createVariableImage(src);
          canvasEditor.addBaseType(imgItem, { scale: true });
        } catch (e) {
          Message.error($t('insertFile.insert_online_image_error'));
          return;
        }
        resetInputs();
        closeImagePicker();
        return;
      }
      try {
        let finalSrc = src;
        // 远程模式下强制保留远程 URL（禁止转 base64）
        if (convertToLocal.value && !remoteImageMode) {
          finalSrc = await urlToBase64(src);
        } else {
          // 规范化远程 URL（trim / 补全协议），data: 与含变量占位符的 URL 原样保留
          finalSrc = normalizeAssetUrl(src);
        }
        runDone(finalSrc, { local: convertToLocal.value && !remoteImageMode });
      } catch (e) {
        Message.error($t('insertFile.insert_online_image_error'));
        return;
      }
      resetInputs();
      closeImagePicker();
    };

    const confirm = () => {
      if (activeTab.value === 'url') {
        confirmUrl();
      }
    };

    const onCancel = () => {
      resetInputs();
    };

    // 插入变量 URL（支持 https://cdn/{{id}}.png 模板串）；
    // 确认时走现有 confirmUrl 管线（变量 URL → 占位图 / 背景 onDone 分流）
    const urlInput = ref(null);
    const insertVariable = (path) => {
      const vp = canvasEditor.getPlugin && canvasEditor.getPlugin('VariablePlugin');
      const d = vp && vp.getDelimiter ? vp.getDelimiter() : { start: '{{', end: '}}' };
      const token = `${d.start}${path}${d.end}`;
      const el = getInputElement(urlInput.value, 'input.ivu-input');
      const { next, caret } = insertAtCursor(el, url.value, token);
      url.value = next;
      nextTick(() => focusCaret(el, caret));
    };

    return {
      pickerState,
      modalTitle,
      remoteImageMode,
      activeTab,
      url,
      convertToLocal,
      localInput,
      urlInput,
      dragging,
      hasAsset,
      triggerLocalPicker,
      onLocalChange,
      onLocalDrop,
      handleUpload,
      confirm,
      insertVariable,
      onCancel,
      varSchemaAvailable,
    };
  },
};
</script>

<style scoped lang="less">
.online-img-row {
  display: flex;
  align-items: center;
  gap: 8px;
  /deep/ .ivu-upload {
    flex-shrink: 0;
  }
}
.local-upload {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px dashed #dcdee2;
  border-radius: 4px;
  padding: 16px 12px;
  cursor: pointer;
  transition: all 0.2s;
  &.is-dragover {
    border-color: #2d8cf0;
    background: #f6faff;
  }
}
.local-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #808695;
  .ivu-icon {
    color: #c5c8ce;
  }
  em {
    font-style: normal;
    font-size: 12px;
    color: #c5c8ce;
  }
  &:hover {
    .ivu-icon {
      color: #2d8cf0;
    }
  }
}
.online-img-option {
  margin-top: 12px;
}
.online-img-tip {
  font-size: 12px;
  color: #999;
  margin-left: 8px;
}
</style>
