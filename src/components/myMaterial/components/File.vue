<!--
 * @Author: 秦少卫
 * @Date: 2024-05-30 10:48:00
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-09 17:08:48
 * @Description: 模板文件
-->
<template>
  <div class="file-wrap">
    <Tooltip :content="props.name" placement="top">
      <div class="file-type-box">
        <Image
          lazy
          :src="props.src"
          fit="contain"
          height="100%"
          width="100%"
          :alt="props.name"
          @click="beforeClearTip"
        />
        <div class="more">
          <Dropdown trigger="click" @on-click="operation">
            <Button size="small" shape="circle" type="text">
              <Icon type="ios-more" :size="24" />
            </Button>
            <template #list>
              <DropdownMenu>
                <DropdownItem name="reName">重命名</DropdownItem>
                <DropdownItem name="delete">删除</DropdownItem>
                <DropdownItem name="transfer">迁移目录</DropdownItem>
              </DropdownMenu>
            </template>
          </Dropdown>
        </div>
      </div>
    </Tooltip>
    <!-- 迁移文件夹 -->
    <Modal v-model="modalVisable" title="请选择迁移目录" @on-ok="transferRequest">
      <Tree :data="treeData" @on-select-change="onTreeSelect"></Tree>
    </Modal>
    <!--  -->
  </div>
</template>

<script>
import { ref } from '@vue/composition-api';
import useMaterial from '@/hooks/useMaterial';
import { useI18n } from '@/hooks/useI18n';
import useSelect from '@/hooks/select';
import { getUserFileTypeTree, updataTempl } from '@/api/user';

import { Modal, Input, Spin, Message } from 'view-design';

export default {
  name: 'ImportTmpl',
  props: {
    name: {
      type: String,
      default: '',
    },
    src: {
      type: String,
      default: '',
    },
    previewSrc: {
      type: String,
      default: '',
    },
    itemId: {
      type: [Number, String],
      default: '',
    },
    json: {
      type: Object,
      default: () => ({}),
    },
  },
  setup(props, { emit }) {
    const { t } = useI18n();
    const { canvasEditor } = useSelect();
    const { reNameFileType, removeTemplInfo, routerToId, getTemplInfo } = useMaterial();

    const operation = (value) => {
      const mapActions = {
        reName: reNameFile,
        delete: deleteFile,
        transfer: transfer,
      };
      mapActions[value]();
    };
    const fileName = ref('');

    const reNameFile = () => {
      fileName.value = props.name;
      Modal.confirm({
        title: '重命名',
        render: (h) => {
          return h(Input, {
            props: {
              value: fileName.value,
              autofocus: true,
              placeholder: '请输入文件名称',
            },
            on: {
              input: (val) => {
                fileName.value = val;
              },
            },
          });
        },
        onOk: async () => {
          if (fileName.value === '') {
            Message.warning('文件名称不能为空');
            return;
          }
          await reNameFileType(fileName.value, props.itemId);
          emit('change');
        },
      });
    };

    const deleteFile = async () => {
      await removeTemplInfo(props.itemId);
      emit('change');
    };

    const beforeClearTip = () => {
      Modal.confirm({
        title: t('tip'),
        content: `<p>${t('replaceTip')}</p>`,
        okText: t('ok'),
        cancelText: t('cancel'),
        onOk: () => getTempData(),
      });
    };

    // 获取模板数据
    const getTempData = async () => {
      Spin.show({
        render: (h) => h('div', t('alert.loading_data')),
      });
      const data = await getTemplInfo(props.itemId);
      routerToId(props.itemId);
      canvasEditor.loadJSON(JSON.stringify(data.data.attributes.json), Spin.hide);
    };

    const modalVisable = ref(false);
    const fileTypeId = ref('');
    const treeData = ref([]);

    const transfer = async () => {
      treeData.value = [];
      fileTypeId.value = '';
      const res = await getUserFileTypeTree();
      treeData.value = [res.data.data];
      modalVisable.value = true;
    };

    // view-design Tree 选中（TreeSelect 在 view-design 中不存在，改用 Tree）
    const onTreeSelect = (selected) => {
      if (selected && selected.length) {
        fileTypeId.value = selected[0].id;
      } else {
        fileTypeId.value = '';
      }
    };

    const transferRequest = async () => {
      const parentId = fileTypeId.value === 'root' ? '' : fileTypeId.value;
      await updataTempl(props.itemId, {
        data: {
          parentId: String(parentId),
        },
      });
      emit('change');
    };

    return {
      props,
      operation,
      beforeClearTip,
      modalVisable,
      fileTypeId,
      treeData,
      onTreeSelect,
      transferRequest,
    };
  },
};
</script>

<style scoped lang="less">
// 文件夹
.file-type-box {
  width: 134px;
  height: 116px;
  cursor: pointer;
  background: #fff;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border: 1px solid #f1f1f1;
  border-radius: 10px;
  img {
    width: 60px;
    margin-top: 12px;
  }
  div.more {
    position: absolute;
    display: none;
  }
  &:hover {
    background: rgb(243, 245, 249);
    border: 1px solid rgb(225, 230, 239);
    border-radius: 8px;
    img {
      opacity: 0.8;
    }
    div.more {
      display: block;
      top: 5px;
      right: 5px;
    }
  }
}
</style>
