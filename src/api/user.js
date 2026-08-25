/*
 * @Author: 秦少卫
 * @Date: 2024-04-24 14:07:06
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-14 16:17:41
 * @Description: 用户接口登录
 */

import axios from 'axios';
const baseURL = process.env.VUE_APP_APIHOST;

const instance = axios.create({ baseURL });

instance.interceptors.request.use(function (config) {
  const token = getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

const tokenKey = 'token';
function getToken() {
  const token = localStorage.getItem(tokenKey);
  return token;
}

// 详情
export const getUserInfo = (data) => instance.get('/api/users/me', data);

// 登录
export const login = (data) => instance.post('/api/auth/local', data);

// 注册
export const register = (data) => instance.post('/api/auth/local/register', data);

// 登出
export const logout = () => localStorage.setItem(tokenKey, '');

// 自动登录
export const autoLogin = (data) => instance.post('/api/custom/autoAuthUser', data);

// 设置token
export const setToken = (token) => localStorage.setItem(tokenKey, token);

// 获取个人素材列表
export const getFileList = (data) => instance.get('/api/user-materials?populate=*', data);

// 上传素材
export const uploadImg = (data) => instance.post('/api/upload', data);

// 创建素材
export const createdMaterial = (data) => instance.post('/api/user-materials', data);

// 删除素材
export const removeMaterial = (id) => instance.delete('/api/user-materials/' + id);

// 创建模板
export const createdTempl = (data) => instance.post('/api/user-templs', data);

// 删除素材
export const removeTempl = (data) => instance.delete(`/api/user-templs/${data}`);

// 更新素材
export const updataTempl = (id, data) => instance.put(`/api/user-templs/${id}`, data);

// 查询素材列表
export const getTmplList = (data) => instance.get(`/api/user-templs?${data}`);

// 查询素材列表
export const getTmplInfo = (data) => instance.get(`/api/user-templs/${data}`);

// 创建文件分类
export const createFileType = (data) => instance.post(`/api/user-templs`, data);

// 查询文件分类列表
export const getFileTypeList = (data) =>
  instance.get(`/api/user-templs?${JSON.stringify(data)}`);

// 获取用户树菜单
export const getUserFileTypeTree = () => instance.get(`/api/user-templ/getUerFileTypeTree`);

// 获取菜单树
export const getFileTypeTree = (data) =>
  instance.get(`/api/custom/getUerFileTypeTree`, {
    params: data,
  });

// 获取用户树菜单
export const getUerFileTree = () => instance.get(`/api/user-templ/getUerFileTree`);
