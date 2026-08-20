<template>
  <!--
   * L2：业务整体替换内置 imagePickerModal
   * 通过 overrides: [{ component: 'imagePickerModal', with: MyBrandedModal }] 生效
   * 保留 URL 输入 + 品牌风格 + 新增"上传到CDN"Tab（复用 asset 适配器）
   -->
  <Modal
    v-model="modal"
    :title="$t('insertFile.insert_online_image')"
    @on-ok="confirm"
    @on-cancel="modal = false"
  >
    <Tabs v-model="activeTab">
      <TabPane :label="$t('insertFile.insert_online_image_url')" name="url">
        <Input v-model="url" :placeholder="$t('insertFile.insert_online_image_placeholder')" />
      </TabPane>
      <TabPane :label="$t('insertFile.insert_online_image_upload')" name="upload">
        <Upload :before-upload="handleUpload" :show-upload-list="false" action="" accept="image/*">
          <Button icon="ios-cloud-upload-outline">上传到业务CDN</Button>
        </Upload>
      </TabPane>
    </Tabs>
    <div class="brand-tip">上传后自动回填地址，可继续编辑或直接插入画布。</div>
  </Modal>
</template>

<script>
import { ref } from '@vue/composition-api';
import { Message } from 'view-design';
import { useEditorContext } from '@/hooks/useEditorContext';
import useSelect from '@/hooks/select';
import { useI18n } from '@/hooks/useI18n';

export default {
  name: 'MyBrandedOnlineImageModal',
  setup() {
    const { registry } = useEditorContext();
    const { t } = useI18n();
    const { canvasEditor } = useSelect();
    const $t = (key) => t(key);

    const asset = registry.get('asset');
    const modal = ref(false);
    const url = ref('');
    const activeTab = ref('url');

    const open = () => {
      url.value = '';
      activeTab.value = 'url';
      modal.value = true;
    };

    const handleUpload = async (file) => {
      try {
        const { url: uploadedUrl } = await asset.uploadImage(file);
        url.value = uploadedUrl || '';
        activeTab.value = 'url';
        Message.success('上传成功，已回填地址');
      } catch (e) {
        Message.error(e.message || '上传失败');
      }
      return false;
    };

    const confirm = async () => {
      const src = url.value.trim();
      if (!/^https?:\/\/.+$/i.test(src) && !/^data:image/.test(src)) {
        Message.error($t('insertFile.insert_online_image_invalid'));
        return;
      }
      try {
        const imgItem = await canvasEditor.createImgByElement({ src });
        canvasEditor.addBaseType(imgItem, { scale: true });
      } catch (e) {
        Message.error($t('insertFile.insert_online_image_error'));
      } finally {
        modal.value = false;
      }
    };

    return { modal, url, activeTab, open, handleUpload, confirm };
  },
};
</script>

<style scoped lang="less">
.brand-tip {
  margin-top: 12px;
  font-size: 12px;
  color: #999;
}
</style>
