/**
 * .vue SFC 的 jest 测试 stub（node 环境不编译 SFC）。
 * 供 moduleNameMapper 把 '*.vue' 映射到此文件；默认导出空组件定义。
 */
module.exports = { name: 'VueStubComponent', render: () => null };
