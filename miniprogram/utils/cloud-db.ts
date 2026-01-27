/**
 * 云数据库服务
 * 基于微信小程序云开发数据库实现
 * 提供统一的 CRUD 接口，与本地数据库接口保持一致
 */

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
	 * 生成唯一ID
	 */
	private generateId(): string {
		return `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
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
			const res = await this.getCollection(collection).get();
			return res.data || [];
		} catch (error) {
			console.error(`[CloudDB] 获取集合 ${collection} 数据失败:`, error);
			return [];
		}
	}

	/**
	 * 根据ID查找单条记录
	 */
	async findById<T extends BaseRecord>(collection: string, id: string): Promise<T | null> {
		try {
			const res = await this.getCollection(collection).doc(id).get();
			return res.data || null;
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				return null;
			}
			console.error(`[CloudDB] 查找记录 ${id} 失败:`, error);
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

			const query = collectionRef.where(condition as any);
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
	async insert<T extends BaseRecord>(collection: string, record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T | null> {
		try {
			const now = this.getTimestamp();

			const newRecord = {
				...record,
				_id: this.generateId(),
				id: this.generateId(),
				createdAt: now,
				updatedAt: now,
			} as T;

			const res = await this.getCollection(collection).add({
				data: newRecord
			});

			if (res._id) {
				newRecord._id = res._id;
				return newRecord;
			}

			return null;
		} catch (error) {
			console.error(`[CloudDB] 插入记录到 ${collection} 失败:`, error);
			return null;
		}
	}

	/**
	 * 批量插入记录
	 */
	async insertMany<T extends BaseRecord>(collection: string, records: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<T[]> {
		try {
			const now = this.getTimestamp();

			const newRecords = records.map(record => ({
				...record,
				_id: this.generateId(),
				id: this.generateId(),
				createdAt: now,
				updatedAt: now,
			})) as T[];

			await Promise.all(newRecords.map(record =>
				this.getCollection(collection).add({data: record})
			));

			return newRecords;
		} catch (error) {
			console.error(`[CloudDB] 批量插入记录到 ${collection} 失败:`, error);
			return [];
		}
	}

	/**
	 * 根据ID更新记录
	 */
	async updateById<T extends BaseRecord>(collection: string, id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<boolean> {
		try {
			const updateData = {
				...updates,
				updatedAt: this.getTimestamp()
			};

			await this.getCollection(collection).doc(id).update({
				data: updateData
			});

			return true;
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				console.warn(`[CloudDB] 未找到ID为 ${id} 的记录`);
				return false;
			}
			console.error(`[CloudDB] 更新记录 ${id} 失败:`, error);
			return false;
		}
	}

	/**
	 * 根据条件更新记录
	 */
	async update<T extends BaseRecord>(collection: string, condition: QueryCondition<T>, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<number> {
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
					this.updateById(collection, record.id, updates)
				));

				return matchedRecords.length;
			}

			const res = await collectionRef.where(condition as any).update({
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
	async deleteById<T extends BaseRecord>(collection: string, id: string): Promise<boolean> {
		try {
			await this.getCollection(collection).doc(id).remove();
			return true;
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				console.warn(`[CloudDB] 未找到ID为 ${id} 的记录`);
				return false;
			}
			console.error(`[CloudDB] 删除记录 ${id} 失败:`, error);
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
					this.deleteById(collection, record.id)
				));

				return matchedRecords.length;
			}

			const res = await collectionRef.where(condition as any).remove();
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
				this.deleteById(collection, record.id)
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

			const res = await collectionRef.where(condition as any).count();
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
		orderBy?: {field: string, direction: 'asc' | 'desc'}
	): Promise<{data: T[], total: number, hasMore: boolean}> {
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

			let query = collectionRef.where(condition as any);

			if (orderBy) {
				query = query.orderBy(orderBy.field, orderBy.direction);
			}

			const skip = (page - 1) * pageSize;
			query = query.skip(skip).limit(pageSize);

			const [dataRes, countRes] = await Promise.all([
				query.get(),
				collectionRef.where(condition as any).count()
			]);

			return {
				data: dataRes.data || [],
				total: countRes.total || 0,
				hasMore: skip + pageSize < (countRes.total || 0)
			};
		} catch (error) {
			console.error(`[CloudDB] 分页查询集合 ${collection} 失败:`, error);
			return {data: [], total: 0, hasMore: false};
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
	ORDERS: 'orders',
	SETTINGS: 'settings',
	SCHEDULE: 'schedule',
	ROTATION: 'rotation',
	MEMBERSHIP_USAGE: 'membership_usage',
} as const;

export type CollectionName = typeof Collections[keyof typeof Collections];
