/**
 * 应用配置文件
 */

export const AppConfig = {
	cloudEnvId: 'cloud1-0gkbm1dic147ccec',

	getCloudEnvId(): string {
		return AppConfig.cloudEnvId || '';
	},

	setCloudEnvId(envId: string) {
		AppConfig.cloudEnvId = envId;
	}
};

export default AppConfig;
