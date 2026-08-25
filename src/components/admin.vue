<!--
 * @Author: 秦少卫
 * @Date: 2024-06-09 13:23:07
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-10 20:17:32
 * @Description: 管理员模式
-->

<template>
  <div v-if="route.query.admin" style="display: inline-block">
    <Dropdown style="margin-left: 10px" @on-click="adminOperation">
      <Button type="primary">
        {{ $t('admin.btnTitle') }}
        <Icon type="ios-arrow-down"></Icon>
      </Button>
      <template #list>
        <DropdownMenu>
          <DropdownItem name="saveImg">{{ $t('admin.save') }}</DropdownItem>
          <DropdownItem name="setToken" divided>{{ $t('admin.setToken') }}</DropdownItem>
        </DropdownMenu>
      </template>
    </Dropdown>

    <Modal v-model="modal" :title="$t('admin.setToken')" @on-ok="setTokenHandel">
      <Form :label-width="50">
        <FormItem label="Token">
          <Input v-model="token" type="textarea"></Input>
        </FormItem>
      </Form>
    </Modal>
  </div>
</template>

<script>
import { ref } from '@vue/composition-api';
import { getToken, setToken } from '@/api/admin';
import { Message, Modal, Input } from 'view-design';
import useSelect from '@/hooks/select';
import useAdmin from '@/hooks/useAdmin';
import { useRoute } from '@/hooks/useRouter';

export default {
  name: 'ImportTmpl',
  setup() {
    const { updataTemplHander, createdTemplHander } = useAdmin();
    const { t } = useSelect();

    const route = useRoute();

    const modal = ref(false);
    const token = ref('');

    const adminOperation = (name) => {
      const handerMap = {
        setToken: showAdmin,
        saveImg: updataTemp,
      };

      handerMap[name]();
    };
    const showAdmin = async () => {
      token.value = getToken();
      modal.value = true;
    };

    const updataTemp = () => {
      // 更新模板
      if (route.query.tempId) {
        updataTemplHander(route.query.tempId);
      } else {
        // 新增
        addTempl();
      }
    };

    const templName = ref('');
    const addTempl = () => {
      Modal.confirm({
        title: t('admin.addTempl'),
        render: (h) => {
          return h(Input, {
            props: {
              size: 'large',
              value: templName.value,
              autofocus: true,
              placeholder: t('admin.addTemplPlaceholder'),
            },
            on: {
              input: (val) => {
                templName.value = val;
              },
            },
          });
        },
        onOk: async () => {
          if (templName.value === '') {
            Message.warning(t('admin.addTemplCheckTip'));
            return;
          }
          await createdTemplHander(templName.value);
        },
      });
    };

    const setTokenHandel = () => {
      setToken(String(token.value));
      Message.success('复制成功');
    };

    return {
      route,
      modal,
      token,
      adminOperation,
      setTokenHandel,
    };
  },
};
</script>

<style scoped lang="less"></style>
