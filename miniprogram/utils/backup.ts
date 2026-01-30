/**
 * 数据备份和恢复工具
 */

interface BackupData {
	timestamp: string;
	version: string;
	data: {
		[key: string]: any[];
	};
}

interface BackupOptions {
	collections?: string[];
	includeStaff?: boolean;
	includeCustomers?: boolean;
	includeSchedule?: boolean;
	includeReservations?: boolean;
}

interface RestoreOptions {
	overwrite?: boolean;
	validateData?: boolean;
}

/**
 * 备份和恢复管理类
 */
class BackupManager {
	/**
	 * 调用备份云函数
	 */
	async backupToCloud(options?: BackupOptions): Promise<BackupData> {
		try {
			const collections = this.getCollectionsToBackup(options);

			wx.showLoading({
				title: '备份中...',
				mask: true
			});

			const res = await wx.cloud.callFunction({
				name: 'backup',
				data: { collections }
			});

			wx.hideLoading();

			if (res.errMsg !== 'cloud.callFunction:ok') {
				throw new Error(res.errMsg);
			}

			const result = res.result;

			if (!result || typeof result === 'string') {
				throw new Error('备份数据格式错误');
			}

			if (result.code !== 0) {
				throw new Error(result.message || '备份失败');
			}

			return {
				timestamp: result.timestamp,
				version: '1.0.0',
				data: result.data
			};
		} catch (error) {
			wx.hideLoading();
			console.error('云备份失败:', error);
			throw error;
		}
	}

	/**
	 * 从本地备份数据
	 */
	async backupToLocal(options?: BackupOptions): Promise<BackupData> {
		try {
			const collections = this.getCollectionsToBackup(options);
			const backupData: BackupData = {
				timestamp: new Date().toISOString(),
				version: '1.0.0',
				data: {}
			};

			for (const collectionName of collections) {
				const key = `db_${collectionName}`;
				const data = wx.getStorageSync(key) || [];
				backupData.data[collectionName] = data;
			}

			return backupData;
		} catch (error) {
			console.error('本地备份失败:', error);
			throw error;
		}
	}

	/**
	 * 调用恢复云函数
	 */
	async restoreFromCloud(backupData: BackupData, options?: RestoreOptions): Promise<void> {
		try {
			wx.showLoading({
				title: '恢复中...',
				mask: true
			});

			const res = await wx.cloud.callFunction({
				name: 'restore',
				data: {
					backupData: backupData.data,
					options: {
						overwrite: options?.overwrite || false
					}
				}
			});

			wx.hideLoading();

			if (res.errMsg !== 'cloud.callFunction:ok') {
				throw new Error(res.errMsg);
			}

			const result = res.result;

			if (!result || typeof result === 'string') {
				throw new Error('恢复数据格式错误');
			}

			if (result.code !== 0) {
				throw new Error(result.message || '恢复失败');
			}

			const { success, failed, skipped } = result.data;

			let message = `恢复完成！成功 ${success.length} 个集合`;
			if (failed.length > 0) {
				message += `，失败 ${failed.length} 个`;
			}
			if (skipped.length > 0) {
				message += `，跳过 ${skipped.length} 个`;
			}

			wx.showModal({
				title: '恢复结果',
				content: message,
				showCancel: false
			});
		} catch (error) {
			wx.hideLoading();
			console.error('云恢复失败:', error);
			throw error;
		}
	}

	/**
	 * 从本地恢复数据
	 */
	async restoreToLocal(backupData: BackupData, options?: RestoreOptions): Promise<void> {
		try {
			if (options?.validateData) {
				const validation = this.validateBackupData(backupData);
				if (!validation.valid) {
					throw new Error(validation.message);
				}
			}

			wx.showLoading({
				title: '恢复中...',
				mask: true
			});

			for (const collectionName in backupData.data) {
				const key = `db_${collectionName}`;
				const records = backupData.data[collectionName];

				if (!options?.overwrite) {
					const existing = wx.getStorageSync(key) || [];
					if (existing.length > 0) {
						console.warn(`集合 ${collectionName} 已有数据，跳过恢复`);
						continue;
					}
				}

				wx.setStorageSync(key, records);
			}

			wx.hideLoading();
			wx.showToast({
				title: '恢复成功',
				icon: 'success'
			});
		} catch (error) {
			wx.hideLoading();
			console.error('本地恢复失败:', error);
			throw error;
		}
	}

	/**
	 * 导出备份为JSON文件
	 */
	async exportBackupAsJson(backupData: BackupData, filename?: string): Promise<void> {
		try {
			const jsonStr = JSON.stringify(backupData, null, 2);

			const tempFilePath = `${wx.env.USER_DATA_PATH}/${filename || `backup_${Date.now()}.json`}`;

			await new Promise<void>((resolve, reject) => {
				wx.getFileSystemManager().writeFile({
					filePath: tempFilePath,
					data: jsonStr,
					encoding: 'utf8',
					success: () => resolve(),
					fail: reject
				});
			});

			wx.showModal({
				title: '导出成功',
				content: '备份数据已导出为JSON文件',
				showCancel: false
			});
		} catch (error) {
			console.error('导出JSON失败:', error);
			wx.showToast({
				title: '导出失败',
				icon: 'none'
			});
		}
	}

	/**
	 * 从JSON文件导入备份
	 */
	async importBackupFromJson(): Promise<BackupData | null> {
		return new Promise((resolve, reject) => {
			wx.chooseMessageFile({
				count: 1,
				type: 'file',
				extension: ['json'],
				success: async (res) => {
					try {
						const filePath = res.tempFiles[0].path;
						const fileContent = await new Promise<string>((resolve, reject) => {
							wx.getFileSystemManager().readFile({
								filePath,
								encoding: 'utf8',
								success: (res) => resolve(res.data as string),
								fail: reject
							});
						});

						const backupData = JSON.parse(fileContent);

						const validation = this.validateBackupData(backupData);
						if (!validation.valid) {
							wx.showModal({
								title: '数据验证失败',
								content: validation.message,
								showCancel: false
							});
							resolve(null);
							return;
						}

						wx.showModal({
							title: '导入成功',
							content: `已导入备份文件，时间: ${backupData.timestamp}`,
							confirmText: '立即恢复',
							cancelText: '取消',
							success: (modalRes) => {
								if (modalRes.confirm) {
									this.restoreFromCloud(backupData, { overwrite: true }).catch(reject);
								} else {
									resolve(backupData);
								}
							}
						});
					} catch (error) {
						console.error('解析JSON失败:', error);
						wx.showModal({
							title: '导入失败',
							content: '文件格式错误或已损坏',
							showCancel: false
						});
						resolve(null);
					}
				},
				fail: (err) => {
					console.error('选择文件失败:', err);
					wx.showToast({
						title: '选择文件失败',
						icon: 'none'
					});
					resolve(null);
				}
			});
		});
	}

	/**
	 * 验证备份数据
	 */
	private validateBackupData(data: any): { valid: boolean; message: string } {
		if (!data || typeof data !== 'object') {
			return { valid: false, message: '数据格式错误' };
		}

		if (!data.timestamp || typeof data.timestamp !== 'string') {
			return { valid: false, message: '缺少时间戳信息' };
		}

		if (!data.data || typeof data.data !== 'object') {
			return { valid: false, message: '缺少备份数据' };
		}

		return { valid: true, message: '' };
	}

	/**
	 * 获取要备份的集合列表
	 */
	private getCollectionsToBackup(options?: BackupOptions): string[] {
		const collections: string[] = [];

		if (options?.collections && options.collections.length > 0) {
			return options.collections;
		}

		if (options?.includeStaff !== false) {
			collections.push('staff');
		}
		if (options?.includeCustomers !== false) {
			collections.push('customers');
		}
		if (options?.includeSchedule !== false) {
			collections.push('schedule');
		}
		if (options?.includeReservations !== false) {
			collections.push('reservations');
		}
		return collections;
	}
}

export const backupManager = new BackupManager();
