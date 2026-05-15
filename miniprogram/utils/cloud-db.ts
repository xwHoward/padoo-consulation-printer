
export type QueryCondition<T> = any;

export interface CloudDbConfig {
	envId?: string;
	traceUser?: boolean;
}

/**
 * 云数据库类
 */
class CloudDatabase {
	private db: DB.Database | null = null;
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
				return;
			}

			if (!this.initialized) {
				wx.cloud.init({
					env: this.envId || undefined,
					traceUser: true
				});
				this.initialized = true;
			}

			this.db = wx.cloud.database({
				env: this.envId || undefined
			});

		} catch (error) {
		}
	}

	/**
	 * 获取当前时间戳字符串
	 */
	private getTimestamp(): string {
		return new Date().toISOString();
	}

	/**
	 * 瞬态故障重试包装器（指数退避 + 抖动）
	 */
	private async retry<T>(fn: () => Promise<T>, label: string, maxRetries: number = 2): Promise<T> {
		let lastError: any;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error;
				if (attempt < maxRetries && this.isTransientError(error)) {
					const delay = Math.floor(100 * Math.pow(2, attempt) + Math.random() * 100);
					console.warn(`[CloudDB] ${label} 重试 ${attempt + 1}/${maxRetries}，${delay}ms 后重试`);
					await new Promise(r => setTimeout(r, delay));
				}
			}
		}
		throw lastError;
	}

	/**
	 * 判断是否为可重试的瞬态错误
	 */
	private isTransientError(error: any): boolean {
		const msg = (error?.errMsg || error?.message || '').toLowerCase();
		return /timeout|network|exceed|limit|busy|try again|internal/i.test(msg);
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
	 * 获取数据库查询操作符（_.gte, _.lte, _.and 等）
	 * 用于构建范围查询条件，避免全量拉取
	 */
	getCommand() {
		if (!this.db) {
			throw new Error('[CloudDB] 数据库未初始化');
		}
		return this.db.command;
	}

	/**
	 * 获取数据库正则表达式对象
	 */
	getRegExp(options: { regexp: string, options?: string }) {
		if (!this.db) {
			throw new Error('[CloudDB] 数据库未初始化');
		}
		return new this.db.RegExp(options);
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
				return [];
			}

			if (res.result.code === 0) {
				return res.result.data || [];
			} else {
				return [];
			}
		} catch (error) {
			return [];
		}
	}

	/**
	 * 根据ID查找单条记录
	 */
	async findById<T extends BaseRecord>(collection: string, _id: string): Promise<T | null> {
		try {
			const res = await this.getCollection(collection).doc(_id).get();
			return res.data as T | null;
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				return null;
			}
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
				console.warn(`[CloudDB] find() 函数条件触发全量拉取 (${collection})，建议改用 getCommand() 构建原生查询`);
				const allData = await this.getAll<T>(collection);
				return allData.filter(condition);
			}

			// 微信客户端 SDK 的 .get() 默认仅返回 20 条，需要分页拉取全量
			const countRes = await collectionRef.where(condition).count();
			const total = countRes.total || 0;
			if (total === 0) return [];

			const PAGE_SIZE = 100;
			const allData: T[] = [];
			let skip = 0;

			while (skip < total) {
				const res = await collectionRef.where(condition).skip(skip).limit(PAGE_SIZE).get();
				const pageData = res.data as T[];
				allData.push(...pageData);
				skip += pageData.length;
				if (pageData.length === 0) break;
			}

			return allData;
		} catch (error) {
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
			return await this.retry(async () => {
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
				return null;
			}

			const newRecord = {
				...dataToInsert,
				_id: res._id,
			} as unknown as T;

			return { ...dataToInsert, _id: res._id } as unknown as T;
			}, "insert(" + collection + ")");
		} catch (error) {
			return null;
		}
	}

	/**
	 * 根据ID更新记录
	 */
	async updateById<T extends BaseRecord>(collection: string, _id: string, updates: Partial<Update<T>>): Promise<boolean> {
		try {
			return await this.retry(async () => {
				const updateData = {
				...updates,
				updatedAt: this.getTimestamp()
			};

			await this.getCollection(collection).doc(_id).get();
			const res = await this.getCollection(collection).doc(_id).update({
				data: updateData
			});
			return (res.stats?.updated || 0) > 0;
			}, "updateById(" + collection + ")");
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				return false;
			}
			return false;
		}
	}

	/**
	 * 根据ID删除记录
	 */
	async deleteById(collection: string, _id: string): Promise<boolean> {
		try {
			return await this.retry(async () => {
				await this.getCollection(collection).doc(_id).remove();
			return true;
			}, "deleteById(" + collection + ")");
		} catch (error) {
			if ((error as any).errMsg?.includes('document not found')) {
				return false;
			}
			return false;
		}
	}


	/**
	 * 分页查询
	 */
	async findWithPage<T extends BaseRecord>(
		collection: string,
		condition: QueryCondition<T>,
		page: number = 1,
		pageSize: number = 20,
		orderBy?: { field: string, direction: 'asc' | 'desc' }
	): Promise<{ data: T[], total: number, hasMore: boolean }> {
		try {
			const collectionRef = this.getCollection(collection);

			if (typeof condition === 'function') {
				console.warn(`[CloudDB] findWithPage() 函数条件触发全量拉取 (${collection})，建议改用 getCommand() 构建原生查询`);
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
				data: dataRes.data as T[],
				total: countRes.total || 0,
				hasMore: skip + pageSize < (countRes.total || 0)
			};
		} catch (error) {
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
					return null;
				}
				await this.updateById<T>(Collections.CONSULTATION, editId, consultation);
				return { ...existing, ...consultation, updatedAt: this.getTimestamp() } as T;
			} else {
				// 使用云函数进行事务性保存
				const res = await wx.cloud.callFunction({
					name: 'saveConsultationTransaction',
					data: {
						consultation: consultation
					}
				});

				if (!res.result || typeof res.result !== 'object') {
					return null;
				}

				if (res.result.code === 0) {
					return res.result.data as T;
				} else {
					// 重复记录等错误
					throw new Error(res.result.message || '保存失败');
				}
			}
		} catch (error) {
			throw error;
		}
	}

	/**
	 * 获取指定日期的咨询单记录
	 */
	async getConsultationsByDate<T extends ConsultationRecord>(date: string): Promise<T[]> {
		try {
			// 微信客户端 SDK .get() 仅返回 20 条，需要分页拉取全量
			const PAGE_SIZE = 20;
			const collectionRef = this.getCollection(Collections.CONSULTATION);
			// 使用专用 date 字段替代 createdAt 正则，可利用索引加速
			const where = { date };
			const allData: T[] = [];
			let skip = 0;

			while (true) {
				const res = await collectionRef.where(where).orderBy('createdAt', 'asc').skip(skip).limit(PAGE_SIZE).get();
				const pageData = res.data as T[];
				allData.push(...pageData);
				if (pageData.length < PAGE_SIZE) break;
				skip += pageData.length;
			}

			return allData;
		} catch (error) {
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
	LOTTERY_PRIZES: 'lottery_prizes',
	STORE_EXPENSE: 'store_expense',
} as const;

export type CollectionName = typeof Collections[keyof typeof Collections];
