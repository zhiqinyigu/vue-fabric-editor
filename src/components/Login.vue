<!--
 * @Author: 秦少卫
 * @Date: 2024-04-24 12:51:24
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-04-24 15:10:46
 * @Description: 登录
-->

<template>
  <div class="box">
    <!-- 登录后 -->
    <Dropdown v-if="userName" @on-click="logoutHandle">
      <a href="javascript:void(0)">
        <Icon type="ios-person" size="20" />
        {{ userName }}
        <Icon type="ios-arrow-down"></Icon>
      </a>
      <template #list>
        <DropdownMenu>
          <DropdownItem>退出登录</DropdownItem>
        </DropdownMenu>
      </template>
    </Dropdown>
    <!-- 登录前 -->
    <Button v-else shape="circle" icon="ios-person" @click="modal = true"></Button>

    <!-- 登录注册弹框 -->
    <Modal v-model="modal" footer-hide>
      <h3>{{ $t('login.title') }}</h3>
      <Tabs :animated="false" @on-click="switchTab">
        <!-- 登录 -->
        <TabPane :label="$t('login.login')">
          <Form ref="loginForm" :model="formInline" :rules="ruleInline" class="form-box">
            <FormItem prop="identifier">
              <Input
                v-model="formInline.identifier"
                type="text"
                :placeholder="$t('login.identifier')"
              >
                <template #prepend>
                  <Icon type="ios-person-outline"></Icon>
                </template>
              </Input>
            </FormItem>
            <FormItem prop="password">
              <Input
                v-model="formInline.password"
                type="password"
                :placeholder="$t('login.password')"
              >
                <template #prepend>
                  <Icon type="ios-lock-outline"></Icon>
                </template>
              </Input>
            </FormItem>
            <FormItem>
              <Button type="primary" long @click="loginHandle">
                {{ $t('login.login') }}
              </Button>
            </FormItem>
          </Form>
        </TabPane>

        <!-- 注册 -->
        <TabPane :label="$t('login.register')">
          <Form
            ref="registerForm"
            :model="registerFormInline"
            :rules="registerRuleInline"
            class="form-box"
          >
            <FormItem prop="username">
              <Input
                v-model="registerFormInline.username"
                type="text"
                :placeholder="$t('login.username')"
              >
                <template #prepend>
                  <Icon type="ios-person-outline"></Icon>
                </template>
              </Input>
            </FormItem>
            <FormItem prop="email">
              <Input
                v-model="registerFormInline.email"
                type="text"
                :placeholder="$t('login.email')"
              >
                <template #prepend>
                  <Icon type="ios-mail-outline" />
                </template>
              </Input>
            </FormItem>

            <FormItem prop="password">
              <Input
                v-model="registerFormInline.password"
                type="password"
                :placeholder="$t('login.password')"
              >
                <template #prepend>
                  <Icon type="ios-lock-outline"></Icon>
                </template>
              </Input>
            </FormItem>
            <FormItem>
              <Button type="primary" long @click="registerHandle">
                {{ $t('login.register') }}
              </Button>
            </FormItem>
          </Form>
        </TabPane>
      </Tabs>
    </Modal>
  </div>
</template>

<script>
import { ref, reactive } from '@vue/composition-api';
import { useI18n } from '@/hooks/useI18n';
import { getUserInfo, setToken, login, register, logout } from '@/api/user';
import { Message, Modal } from 'view-design';

export default {
  name: 'Login',
  setup() {
    const modal = ref(false);
    const { t } = useI18n();
    const userName = ref('');
    // 获取用户详情
    getUserInfo()
      .then((res) => {
        userName.value = res.data.username;
      })
      .catch(() => {
        logout();
      });

    const reloadPage = () => {
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    };
    // 退出
    const logoutHandle = () => {
      Modal.confirm({
        title: t('login.logoutTip'),
        onOk: () => {
          logout();
          Message.success(t('login.logoutSuccessTip'));
          reloadPage();
        },
      });
    };
    // 登录逻辑 ------------------
    const formInline = reactive({
      identifier: '',
      password: '',
    });
    const ruleInline = reactive({
      identifier: [{ required: true, message: t('login.identifierValidate'), trigger: 'blur' }],
      password: [
        { required: true, message: t('login.passwordValidate'), trigger: 'blur' },
        {
          type: 'string',
          min: 6,
          message: t('login.passwordValidate'),
          trigger: 'blur',
        },
      ],
    });
    const loginForm = ref(null);

    const loginHandle = () => {
      loginForm.value.validate((valid) => {
        if (valid) {
          login(formInline)
            .then((res) => {
              setToken(res.data.jwt);
              Message.success(t('login.welcome'));
              reloadPage();
            })
            .catch((res) => {
              Message.error(res.response.data.error.message);
            });
        }
      });
    };

    // 注册逻辑 分割线--------------------
    const registerFormInline = reactive({
      username: '',
      password: '',
      email: '',
    });
    const registerRuleInline = reactive({
      username: [{ required: true, message: t('login.identifierValidate'), trigger: 'blur' }],
      password: [
        { required: true, message: t('login.passwordValidate'), trigger: 'blur' },
        {
          type: 'string',
          min: 6,
          message: t('login.passwordValidate'),
          trigger: 'blur',
        },
      ],
      email: [
        { required: true, message: t('login.emailValidate'), trigger: 'blur' },
        {
          type: 'email',
          message: t('login.emailValidate'),
          trigger: 'blur',
        },
      ],
    });
    const registerForm = ref(null);

    const registerHandle = () => {
      registerForm.value.validate((valid) => {
        if (valid) {
          register(registerFormInline)
            .then((res) => {
              setToken(res.data.jwt);
              Message.success(t('login.welcome'));
              reloadPage();
            })
            .catch((res) => {
              Message.error(res.response.data.error.message);
            });
        }
      });
    };

    const switchTab = () => {
      registerForm.value && registerForm.value.resetFields();
      loginForm.value && loginForm.value.resetFields();
    };

    return {
      modal,
      userName,
      logoutHandle,
      formInline,
      ruleInline,
      loginHandle,
      registerFormInline,
      registerRuleInline,
      registerHandle,
      switchTab,
    };
  },
};
</script>
<style scoped lang="less">
.box {
  display: inline-block;
}
.form-box {
  padding-top: 10px;
}
h3 {
  padding-bottom: 10px;
}
</style>
