
export type QueryCondition<T> = Partial<T> | ((item: T) => boolean);

export interface CloudDbConfig {
	envId?: string;
	traceUser?: boolean;
}

/**
 * 云数据库类
 */
class CloudDatabase {
	private db: any;
	private envId: string = '';
	private initialized: boolean = false;

	constructor(config?: CloudDbConfig) {
		if (config?.envId) {
			this.envId = config.envId;
		}
		this.init();
	}

	/**
	 * 初始化云数据库
	 */
	private init() {
		try {
			if (!wx.cloud) {
				console.error('[CloudDB] 云开发环境未初始化');
				return;
			}

			if (!this.initialized) {
				wx.cloud.init({
					env: this.envId || undefined,
					traceUser: true
				});
				this.initialized = true;
				console.log('[CloudDB] 云开发环境初始化成功，环境ID:', this.envId || '默认环境');
			}

			this.db = wx.cloud.database({
				env: this.envId || undefined
			});

			console.log('[CloudDB] 云数据库初始化成功');
		} catch (error) {
			console.error('[CloudDB] 云数据库初始化失败:', error);
		}
	}

	/**
	 * 获取当前时间戳字符串
	 */
	private getTimestamp(): string {
		return new Date().toISOString();
	}

	/**
	 * 获取集合引用
	 */
	private getCollection(collection: string) {
		if (!this.db) {
			throw new Error('[CloudDB] 数据库未初始化');
		}
		return this.db.collection(collection);
	}

	/**
	 * 获取集合所有数据
	 */
	async getAll<T extends BaseRecord>(collection: string): Promise<T[]> {
		try {
			const res = await wx.cloud.callFunction({
				name: 'getAll',
				data: { collection }
			});

			if (!res.result || typeof res.result !== 'object') {
				console.error(`[CloudDB] 云函数 ${collection} 调用失败:`, res);
				return [];
			}

			if (res.result.code === 0) {
				return res.result.data || [];
			} else {
				console.error(`[CloudDB] 云函数获取集合 ${collection} 数据失败:`, res.result.message);
				return [];
			}
		} catch (error) {
			console.error(`[CloudDB] 获取集合 ${collection} 数据失败:`, error);
			return [];
		}
	}

	/**
	 * 根据ID查找单条记录
	 */
	async findById<T extends BaseRecord>(collection: string, _id: string): Promise<T | null> {
		try {
			const res = await this.getCollection(collection).doc(_id).get();
			return res.data || null;
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				return null;
			}
			console.error(`[CloudDB] 查找记录 ${_id} 失败:`, error);
			return null;
		}
	}

	/**
	 * 根据条件查找记录
	 */
	async find<T extends BaseRecord>(collection: string, condition: QueryCondition<T>): Promise<T[]> {
		try {
			const collectionRef = this.getCollection(collection);

			if (typeof condition === 'function') {
				const allData = await this.getAll<T>(collection);
				return allData.filter(condition);
			}

			console.log(`[CloudDB] 查询集合 ${collection}，条件:`, condition);
			const query = collectionRef.where(condition);
			const res = await query.get();
			console.log(`[CloudDB] 查询结果数量:`, res.data?.length || 0);
			return res.data || [];
		} catch (error) {
			console.error(`[CloudDB] 查询集合 ${collection} 失败:`, error);
			return [];
		}
	}

	/**
	 * 查找单条记录
	 */
	async findOne<T extends BaseRecord>(collection: string, condition: QueryCondition<T>): Promise<T | null> {
		console.log(`[CloudDB] findOne - 集合: ${collection}，条件:`, condition);
		const results = await this.find<T>(collection, condition);
		console.log(`[CloudDB] findOne - 查询结果数量:`, results.length);
		if (results.length > 0) {
			console.log(`[CloudDB] findOne - 第一条记录:`, results[0]);
		}
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * 插入单条记录
	 */
	async insert<T extends BaseRecord>(collection: string, record: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<T | null> {
		try {
			const now = this.getTimestamp();

			const dataToInsert = {
				...record,
				createdAt: now,
				updatedAt: now,
			};

			console.log(`[CloudDB] 插入记录到 ${collection}:`, dataToInsert);

			const res = await this.getCollection(collection).add({
				data: dataToInsert
			});

			console.log(`[CloudDB] 插入结果:`, res);

			if (!res._id) {
				console.error(`[CloudDB] 插入失败，未返回 _id`);
				return null;
			}

			const newRecord = {
				...dataToInsert,
				_id: res._id,
			} as unknown as T;

			console.log(`[CloudDB] 插入记录成功，_id:`, newRecord._id);
			return newRecord;
		} catch (error) {
			console.error(`[CloudDB] 插入记录到 ${collection} 失败:`, error);
			return null;
		}
	}

	/**
	 * 批量插入记录
	 */
	async insertMany<T extends BaseRecord>(collection: string, records: Add<T>[]): Promise<(T | null)[]> {
		try {
			const now = this.getTimestamp();

			const dataToInsertList = records.map(record => {
				return {
					...record,
					createdAt: now,
					updatedAt: now,
				};
			});

			const insertResults = await Promise.all(dataToInsertList.map(record =>
				this.getCollection(collection).add({ data: record })
			));

			const newRecords = insertResults.map((res: T, index) => {
				if (!res._id) {
					console.error(`[CloudDB] 批量插入失败，第${index}条记录未返回 _id`);
					return null;
				}
				return {
					...dataToInsertList[index],
					_id: res._id,
				} as unknown as T;
			}).filter(Boolean);

			return newRecords;
		} catch (error) {
			console.error(`[CloudDB] 批量插入记录到 ${collection} 失败:`, error);
			return [];
		}
	}

	/**
	 * 根据ID更新记录
	 */
	async updateById<T extends BaseRecord>(collection: string, _id: string, updates: Partial<Update<T>>): Promise<boolean> {
		try {
			const updateData = {
				...updates,
				updatedAt: this.getTimestamp()
			};

			console.log(`[CloudDB] 更新记录 ${_id}，数据:`, updateData);

			const res = await this.getCollection(collection).doc(_id).update({
				data: updateData
			});
			console.log(`[CloudDB] 更新记录 ${_id} 结果:`, res);
			return res.stats?.updated || 0 > 0;
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				console.warn(`[CloudDB] 未找到ID为 ${_id} 的记录`);
				return false;
			}
			console.error(`[CloudDB] 更新记录 ${_id} 失败:`, error);
			return false;
		}
	}

	/**
	 * 根据条件更新记录
	 */
	async update<T extends BaseRecord>(collection: string, condition: QueryCondition<T>, updates: Partial<Update<T>>): Promise<number> {
		try {
			const collectionRef = this.getCollection(collection);
			const updateData = {
				...updates,
				updatedAt: this.getTimestamp()
			};

			if (typeof condition === 'function') {
				const allData = await this.getAll<T>(collection);
				const matchedRecords = allData.filter(condition);

				await Promise.all(matchedRecords.map(record =>
					this.updateById(collection, record._id, updates)
				));

				return matchedRecords.length;
			}

			const res = await collectionRef.where(condition).update({
				data: updateData
			});

			return res.stats?.updated || 0;
		} catch (error) {
			console.error(`[CloudDB] 批量更新记录失败:`, error);
			return 0;
		}
	}

	/**
	 * 根据ID删除记录
	 */
	async deleteById(collection: string, _id: string): Promise<boolean> {
		try {
			await this.getCollection(collection).doc(_id).remove();
			return true;
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				console.warn(`[CloudDB] 未找到ID为 ${_id} 的记录`);
				return false;
			}
			console.error(`[CloudDB] 删除记录 ${_id} 失败:`, error);
			return false;
		}
	}

	/**
	 * 根据条件删除记录
	 */
	async delete<T extends BaseRecord>(collection: string, condition: QueryCondition<T>): Promise<number> {
		try {
			const collectionRef = this.getCollection(collection);

			if (typeof condition === 'function') {
				const allData = await this.getAll<T>(collection);
				const matchedRecords = allData.filter(condition);

				await Promise.all(matchedRecords.map(record =>
					this.deleteById(collection, record._id)
				));

				return matchedRecords.length;
			}

			const res = await collectionRef.where(condition).remove();
			return res.stats?.removed || 0;
		} catch (error) {
			console.error(`[CloudDB] 批量删除记录失败:`, error);
			return 0;
		}
	}

	/**
	 * 清空集合
	 */
	async clear(collection: string): Promise<boolean> {
		try {
			const allData = await this.getAll(collection);

			if (allData.length === 0) {
				return true;
			}

			await Promise.all(allData.map(record =>
				this.deleteById(collection, record._id)
			));

			return true;
		} catch (error) {
			console.error(`[CloudDB] 清空集合 ${collection} 失败:`, error);
			return false;
		}
	}

	/**
	 * 获取集合记录数量
	 */
	async count<T extends BaseRecord>(collection: string, condition?: QueryCondition<T>): Promise<number> {
		try {
			const collectionRef = this.getCollection(collection);

			if (!condition) {
				const res = await collectionRef.count();
				return res.total || 0;
			}

			if (typeof condition === 'function') {
				const results = await this.find<T>(collection, condition);
				return results.length;
			}

			const res = await collectionRef.where(condition).count();
			return res.total || 0;
		} catch (error) {
			console.error(`[CloudDB] 获取集合 ${collection} 数量失败:`, error);
			return 0;
		}
	}

	/**
	 * 检查记录是否存在
	 */
	async exists<T extends BaseRecord>(collection: string, condition: QueryCondition<T>): Promise<boolean> {
		const result = await this.findOne<T>(collection, condition);
		return result !== null;
	}

	/**
	 * 分页查询
	 */
	async findWithPage<T extends BaseRecord>(
		collection: string,
		condition?: QueryCondition<T>,
		page: number = 1,
		pageSize: number = 20,
		orderBy?: { field: string, direction: 'asc' | 'desc' }
	): Promise<{ data: T[], total: number, hasMore: boolean }> {
		try {
			const collectionRef = this.getCollection(collection);

			if (typeof condition === 'function') {
				const allData = await this.getAll<T>(collection);
				const filteredData = allData.filter(condition);
				const total = filteredData.length;
				const start = (page - 1) * pageSize;
				const data = filteredData.slice(start, start + pageSize);

				return {
					data,
					total,
					hasMore: start + pageSize < total
				};
			}

			let query = collectionRef.where(condition);

			if (orderBy) {
				query = query.orderBy(orderBy.field, orderBy.direction);
			}

			const skip = (page - 1) * pageSize;
			query = query.skip(skip).limit(pageSize);

			const [dataRes, countRes] = await Promise.all([
				query.get(),
				collectionRef.where(condition).count()
			]);

			return {
				data: dataRes.data || [],
				total: countRes.total || 0,
				hasMore: skip + pageSize < (countRes.total || 0)
			};
		} catch (error) {
			console.error(`[CloudDB] 分页查询集合 ${collection} 失败:`, error);
			return { data: [], total: 0, hasMore: false };
		}
	}

	/**
	 * 保存咨询单（新建或更新）
	 */
	async saveConsultation<T extends ConsultationRecord>(
		consultation: Add<T>,
		editId?: string
	): Promise<T | null> {
		try {
			if (editId) {
				const existing = await this.findById<T>(Collections.CONSULTATION, editId);
				if (!existing) {
					console.error('[CloudDB] 未找到要更新的咨询单:', editId);
					return null;
				}
				await this.updateById<T>(Collections.CONSULTATION, editId, consultation);
				return { ...existing, ...consultation, updatedAt: this.getTimestamp() } as T;
			} else {
				return await this.insert<T>(Collections.CONSULTATION, consultation);
			}
		} catch (error) {
			console.error('[CloudDB] 保存咨询单失败:', error);
			return null;
		}
	}

	/**
	 * 获取指定日期的咨询单记录
	 */
	async getConsultationsByDate<T extends ConsultationRecord>(date: string): Promise<T[]> {
		try {
			const res = await this.getCollection(Collections.CONSULTATION)
				.where({
					createdAt: this.db.RegExp({
						regexp: `^${date}`,
						options: 'i'
					})
				})
				.orderBy('createdAt', 'asc')
				.get();
			return res.data || [];
		} catch (error) {
			console.error('[CloudDB] 获取日期咨询单失败:', error);
			return [];
		}
	}

	/**
	 * 获取所有咨询单记录（按日期分组）
	 */
	async getAllConsultations<T extends ConsultationRecord>(): Promise<Record<string, T[]>> {
		try {
			const allRecords = await this.getAll<T>(Collections.CONSULTATION);
			const grouped: Record<string, T[]> = {};

			allRecords.forEach(record => {
				const date = record.createdAt.substring(0, 10);
				if (!grouped[date]) {
					grouped[date] = [];
				}
				grouped[date].push(record);
			});

			return grouped;
		} catch (error) {
			console.error('[CloudDB] 获取所有咨询单失败:', error);
			return {};
		}
	}

	/**
	 * 获取指定顾客的所有咨询单记录
	 */
	async getConsultationsByCustomer<T extends ConsultationRecord>(phone: string): Promise<T[]> {
		try {
			const res = await this.getCollection(Collections.CONSULTATION)
				.where({ phone })
				.orderBy('createdAt', 'desc')
				.get();
			return res.data || [];
		} catch (error) {
			console.error('[CloudDB] 获取顾客咨询单失败:', error);
			return [];
		}
	}

	/**
	 * 根据技师获取咨询单记录
	 */
	async getConsultationsByTechnician<T extends ConsultationRecord>(technician: string): Promise<T[]> {
		try {
			const res = await this.getCollection(Collections.CONSULTATION)
				.where({ technician })
				.orderBy('createdAt', 'desc')
				.get();
			return res.data || [];
		} catch (error) {
			console.error('[CloudDB] 获取技师咨询单失败:', error);
			return [];
		}
	}

	/**
	 * 批量更新指定日期的咨询单加班数据
	 */
	async updateOvertimeForDate(date: string, overtimeUpdates: Record<string, number>): Promise<boolean> {
		try {
			const records = await this.getConsultationsByDate<ConsultationRecord>(date);

			await Promise.all(
				records
					.filter(record => overtimeUpdates[record._id] !== undefined)
					.map(record =>
						this.updateById(
							Collections.CONSULTATION,
							record._id,
							{ overtime: overtimeUpdates[record._id] }
						)
					)
			);

			return true;
		} catch (error) {
			console.error('[CloudDB] 批量更新加班数据失败:', error);
			return false;
		}
	}

	/**
	 * 清理超过指定天数的旧咨询单记录
	 */
	async cleanupOldConsultations(days: number = 30): Promise<number> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - days);
			const cutoffStr = cutoffDate.toISOString().substring(0, 10);

			const allRecords = await this.getAll<ConsultationRecord>(Collections.CONSULTATION);
			const oldRecords = allRecords.filter(record =>
				record.createdAt.substring(0, 10) < cutoffStr
			);

			await Promise.all(oldRecords.map(record =>
				this.deleteById(Collections.CONSULTATION, record._id)
			));

			return oldRecords.length;
		} catch (error) {
			console.error('[CloudDB] 清理旧咨询单失败:', error);
			return 0;
		}
	}
}

export const cloudDb = new CloudDatabase();

export const Collections = {
	STAFF: 'staff',
	CUSTOMERS: 'customers',
	MEMBERSHIP: 'membership',
	CUSTOMER_MEMBERSHIP: 'customer_membership',
	RESERVATIONS: 'reservations',
	SETTINGS: 'settings',
	SCHEDULE: 'schedule',
	ROTATION: 'rotation',
	MEMBERSHIP_USAGE: 'membership_usage',
	PROJECTS: 'projects',
	ROOMS: 'rooms',
	ESSENTIAL_OILS: 'essential_oils',
	CONSULTATION: 'consultation_records',
	USERS: 'users',
} as const;

export type CollectionName = typeof Collections[keyof typeof Collections];
