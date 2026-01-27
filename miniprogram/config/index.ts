/**
 * 应用配置文件
 */

export const AppConfig = {
	useCloudDatabase: true,
	cloudEnvId: 'cloud1-0gkbm1dic147ccec',

	getCloudEnvId(): string {
		return this.cloudEnvId || wx.cloud?.getEnv?.()?.envId || '';
	},

	setCloudEnvId(envId: string) {
		this.cloudEnvId = envId;
		console.log('[AppConfig] 云环境ID已更新:', envId);
	}
};

export default AppConfig;
