
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

			const query = collectionRef.where(condition);
			const res = await query.get();
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
		const results = await this.find<T>(collection, condition);
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


			const res = await this.getCollection(collection).add({
				data: dataToInsert
			});


			if (!res._id) {
				console.error(`[CloudDB] 插入失败，未返回 _id`);
				return null;
			}

			const newRecord = {
				...dataToInsert,
				_id: res._id,
			} as unknown as T;

			return newRecord;
		} catch (error) {
			console.error(`[CloudDB] 插入记录到 ${collection} 失败:`, error);
			return null;
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
			const doc = await this.getCollection(collection).doc(_id).get();
			console.log(`[CloudDB] 更新记录 ${_id} 前数据:`, doc.data);
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
