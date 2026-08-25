/*
 * @Author: 秦少卫
 * @Date: 2023-08-04 21:13:16
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-05-11 14:20:26
 * @Description: 素材插件
 */
import axios from 'axios';
import qs from 'qs';
class MaterialPlugin {
    constructor(canvas, editor, config) {
        this.canvas = canvas;
        this.editor = editor;
        this.repoSrc = config.repoSrc;
        this.apiMapUrl = {
            template: config.repoSrc + '/template/type.json',
            svg: config.repoSrc + '/svg/type.json',
        };
    }
    // 获取模板分类
    getTemplTypeList() {
        return axios.get(`${this.repoSrc}/api/templ-types?pagination[pageSize]=100`).then((res) => {
            const list = res.data.data.map((item) => {
                return {
                    value: item.id,
                    label: item.attributes.name,
                };
            });
            return list;
        });
    }
    // 分页获取模板列表
    getTemplList(templType = '', index = 1, searchKeyword = '') {
        const query = {
            fields: '*',
            populate: {
                img: '*',
            },
            filters: {},
            pagination: {
                page: index,
                pageSize: 10,
            },
        };
        const queryParams = this._getQueryParams(query, [
            {
                key: 'templ_type',
                value: templType,
                type: '$eq',
            },
            {
                key: 'name',
                value: searchKeyword,
                type: '$contains',
            },
        ]);
        return axios.get(`${this.repoSrc}/api/templs?${queryParams}`).then((res) => {
            var _a, _b;
            const list = res.data.data.map((item) => {
                return {
                    name: item.attributes.name,
                    desc: item.attributes.desc,
                    src: this._getMaterialPreviewUrl(item.attributes.img),
                    json: item.attributes.json,
                };
            });
            return { list, pagination: (_b = (_a = res === null || res === void 0 ? void 0 : res.data) === null || _a === void 0 ? void 0 : _a.meta) === null || _b === void 0 ? void 0 : _b.pagination };
        });
    }
    /**
     * @description: 获取素材分类
     * @return {Promise<any>}
     */
    getMaterialTypeList() {
        return axios.get(`${this.repoSrc}/api/material-types?pagination[pageSize]=100`).then((res) => {
            const list = res.data.data.map((item) => {
                return {
                    value: item.id,
                    label: item.attributes.name,
                };
            });
            return list;
        });
    }
    /**
     * @description: 获取素材列表
     * @returns Promise<Array>
     */
    getMaterialList(materialType = '', index = 1, searchKeyword = '') {
        const query = {
            populate: {
                img: '*',
            },
            // fields: ['materialType'],
            filters: {},
            pagination: {
                page: index,
                pageSize: 50,
            },
        };
        const queryParams = this._getQueryParams(query, [
            {
                key: 'material_type',
                value: materialType,
                type: '$eq',
            },
            {
                key: 'name',
                value: searchKeyword,
                type: '$contains',
            },
        ]);
        return axios.get(`${this.repoSrc}/api/materials?${queryParams}`).then((res) => {
            var _a, _b;
            const list = res.data.data.map((item) => {
                return {
                    name: item.attributes.name,
                    desc: item.attributes.desc,
                    src: this._getMaterialInfoUrl(item.attributes.img),
                    previewSrc: this._getMaterialPreviewUrl(item.attributes.img),
                };
            });
            return { list, pagination: (_b = (_a = res === null || res === void 0 ? void 0 : res.data) === null || _a === void 0 ? void 0 : _a.meta) === null || _b === void 0 ? void 0 : _b.pagination };
        });
    }
    getSizeList() {
        return axios.get(`${this.repoSrc}/api/sizes?pagination[pageSize]=100`).then((res) => {
            const list = res.data.data.map((item) => {
                return {
                    value: item.id,
                    name: item.attributes.name,
                    width: Number(item.attributes.width),
                    height: Number(item.attributes.height),
                    unit: item.attributes.unit,
                };
            });
            return list;
        });
    }
    getFontList() {
        return axios.get(`${this.repoSrc}/api/fonts?pagination[pageSize]=100`).then((res) => {
            const list = res.data.data.map((item) => {
                return {
                    value: item.id,
                    label: item.attributes.name,
                };
            });
            return list;
        });
    }
    _getMaterialInfoUrl(info) {
        var _a, _b;
        const imgUrl = ((_b = (_a = info === null || info === void 0 ? void 0 : info.data) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.url) || '';
        return this.repoSrc + imgUrl;
    }
    _getMaterialPreviewUrl(info) {
        var _a, _b, _c, _d, _e, _f;
        const imgUrl = ((_d = (_c = (_b = (_a = info === null || info === void 0 ? void 0 : info.data) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.formats) === null || _c === void 0 ? void 0 : _c.small) === null || _d === void 0 ? void 0 : _d.url) || ((_f = (_e = info === null || info === void 0 ? void 0 : info.data) === null || _e === void 0 ? void 0 : _e.attributes) === null || _f === void 0 ? void 0 : _f.url) || '';
        return this.repoSrc + imgUrl;
    }
    // 拼接查询条件参数
    _getQueryParams(option, filters) {
        filters.forEach((item) => {
            const { key, value, type } = item;
            if (value) {
                option.filters[key] = { [type]: value };
            }
        });
        return qs.stringify(option);
    }
    async getMaterialInfo(typeId) {
        const url = this.apiMapUrl[typeId];
        const res = await axios.get(url, { params: { typeId } });
        return res.data.data;
    }
}
MaterialPlugin.pluginName = 'MaterialPlugin';
MaterialPlugin.apis = [
    'getTemplTypeList',
    'getTemplList',
    'getMaterialTypeList',
    'getMaterialList',
    'getSizeList',
];
export default MaterialPlugin;
