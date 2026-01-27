/**
 * 本地缓存数据库服务
 * 基于 wx.getStorageSync / wx.setStorageSync 实现
 * 提供统一的 CRUD 接口，支持多表数据存储
 */

// 数据库存储键前缀
const DB_PREFIX = 'db_';

// 查询条件类型
export type QueryCondition<T> = Partial<T> | ((item: T) => boolean);

/**
 * 生成唯一ID
 */
export function generateId(): string {
	const timestamp = Date.now().toString(36);
	const randomStr = Math.random().toString(36).substring(2, 10);
	return `${ timestamp }_${ randomStr }`;
}

/**
 * 获取当前时间戳字符串
 */
export function getTimestamp(): string {
	return new Date().toISOString();
}

/**
 * 数据库类
 */
class Database {
	/**
	 * 获取存储键名
	 */
	private getStorageKey(collection: string): string {
		return `${ DB_PREFIX }${ collection }`;
	}

	/**
	 * 获取集合所有数据
	 */
	getAll<T extends BaseRecord>(collection: string): T[] {
		try {
			const key = this.getStorageKey(collection);
			const data = wx.getStorageSync(key);
			return Array.isArray(data) ? data : [];
		} catch (error) {
			console.error(`[DB] 获取集合 ${ collection } 数据失败:`, error);
			return [];
		}
	}

	/**
	 * 保存集合所有数据
	 */
	private saveAll<T extends BaseRecord>(collection: string, data: T[]): boolean {
		try {
			const key = this.getStorageKey(collection);
			wx.setStorageSync(key, data);
			return true;
		} catch (error) {
			console.error(`[DB] 保存集合 ${ collection } 数据失败:`, error);
			return false;
		}
	}

	/**
	 * 根据ID查找单条记录
	 */
	findById<T extends BaseRecord>(collection: string, id: string): T | null {
		const data = this.getAll<T>(collection);
		return data.find(item => item.id === id) || null;
	}

	/**
	 * 根据条件查找记录
	 */
	find<T extends BaseRecord>(collection: string, condition: QueryCondition<T>): T[] {
		const data = this.getAll<T>(collection);

		if (typeof condition === 'function') {
			return data.filter(condition);
		}

		// 对象条件匹配
		return data.filter(item => {
			for (const key in condition) {
				if (condition[key] !== undefined && item[key] !== condition[key]) {
					return false;
				}
			}
			return true;
		});
	}

	/**
	 * 查找单条记录
	 */
	findOne<T extends BaseRecord>(collection: string, condition: QueryCondition<T>): T | null {
		const results = this.find<T>(collection, condition);
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * 插入单条记录
	 */
	insert<T extends BaseRecord>(collection: string, record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T | null {
		try {
			const data = this.getAll<T>(collection);
			const now = getTimestamp();

			const newRecord = {
				...record,
				id: generateId(),
				createdAt: now,
				updatedAt: now,
			} as T;

			data.push(newRecord);

			if (this.saveAll(collection, data)) {
				return newRecord;
			}
			return null;
		} catch (error) {
			console.error(`[DB] 插入记录到 ${ collection } 失败:`, error);
			return null;
		}
	}

	/**
	 * 批量插入记录
	 */
	insertMany<T extends BaseRecord>(collection: string, records: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[]): T[] {
		try {
			const data = this.getAll<T>(collection);
			const now = getTimestamp();

			const newRecords = records.map(record => ({
				...record,
				id: generateId(),
				createdAt: now,
				updatedAt: now,
			})) as T[];

			data.push(...newRecords);

			if (this.saveAll(collection, data)) {
				return newRecords;
			}
			return [];
		} catch (error) {
			console.error(`[DB] 批量插入记录到 ${ collection } 失败:`, error);
			return [];
		}
	}

	/**
	 * 根据ID更新记录
	 */
	updateById<T extends BaseRecord>(collection: string, id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): boolean {
		try {
			const data = this.getAll<T>(collection);
			const index = data.findIndex(item => item.id === id);

			if (index === -1) {
				console.warn(`[DB] 未找到ID为 ${ id } 的记录`);
				return false;
			}

			data[index] = {
				...data[index],
				...updates,
				updatedAt: getTimestamp(),
			};

			return this.saveAll(collection, data);
		} catch (error) {
			console.error(`[DB] 更新记录 ${ id } 失败:`, error);
			return false;
		}
	}

	/**
	 * 根据条件更新记录
	 */
	update<T extends BaseRecord>(collection: string, condition: QueryCondition<T>, updates: Partial<Omit<T, 'id' | 'createdAt'>>): number {
		try {
			const data = this.getAll<T>(collection);
			let count = 0;
			const now = getTimestamp();

			const matchFn = typeof condition === 'function'
				? condition
				: (item: T) => {
					for (const key in condition) {
						if (condition[key] !== undefined && item[key] !== condition[key]) {
							return false;
						}
					}
					return true;
				};

			for (let i = 0; i < data.length; i++) {
				if (matchFn(data[i])) {
					data[i] = {
						...data[i],
						...updates,
						updatedAt: now,
					};
					count++;
				}
			}

			if (count > 0) {
				this.saveAll(collection, data);
			}

			return count;
		} catch (error) {
			console.error(`[DB] 批量更新记录失败:`, error);
			return 0;
		}
	}

	/**
	 * 根据ID删除记录
	 */
	deleteById<T extends BaseRecord>(collection: string, id: string): boolean {
		try {
			const data = this.getAll<T>(collection);
			const index = data.findIndex(item => item.id === id);

			if (index === -1) {
				console.warn(`[DB] 未找到ID为 ${ id } 的记录`);
				return false;
			}

			data.splice(index, 1);
			return this.saveAll(collection, data);
		} catch (error) {
			console.error(`[DB] 删除记录 ${ id } 失败:`, error);
			return false;
		}
	}

	/**
	 * 根据条件删除记录
	 */
	delete<T extends BaseRecord>(collection: string, condition: QueryCondition<T>): number {
		try {
			const data = this.getAll<T>(collection);
			const originalLength = data.length;

			const matchFn = typeof condition === 'function'
				? condition
				: (item: T) => {
					for (const key in condition) {
						if (condition[key] !== undefined && item[key] !== condition[key]) {
							return false;
						}
					}
					return true;
				};

			const filteredData = data.filter(item => !matchFn(item));
			const deletedCount = originalLength - filteredData.length;

			if (deletedCount > 0) {
				this.saveAll(collection, filteredData);
			}

			return deletedCount;
		} catch (error) {
			console.error(`[DB] 批量删除记录失败:`, error);
			return 0;
		}
	}

	/**
	 * 清空集合
	 */
	clear(collection: string): boolean {
		try {
			const key = this.getStorageKey(collection);
			wx.removeStorageSync(key);
			return true;
		} catch (error) {
			console.error(`[DB] 清空集合 ${ collection } 失败:`, error);
			return false;
		}
	}

	/**
	 * 获取集合记录数量
	 */
	count<T extends BaseRecord>(collection: string, condition?: QueryCondition<T>): number {
		if (!condition) {
			return this.getAll<T>(collection).length;
		}
		return this.find<T>(collection, condition).length;
	}

	/**
	 * 检查记录是否存在
	 */
	exists<T extends BaseRecord>(collection: string, condition: QueryCondition<T>): boolean {
		return this.findOne<T>(collection, condition) !== null;
	}
}

// 导出单例实例
export const db = new Database();

// 预定义的集合名称常量
export const Collections = {
	STAFF: 'staff',           // 员工
	CUSTOMERS: 'customers',   // 顾客
	MEMBERSHIP: 'membership', // 会员卡
	CUSTOMER_MEMBERSHIP: 'customer_membership', // 顾客会员卡关联
	RESERVATIONS: 'reservations', // 预约
	ORDERS: 'orders',         // 订单/单据
	SETTINGS: 'settings',     // 设置
	SCHEDULE: 'schedule',     // 排班
	ROTATION: 'rotation',     // 轮排
	MEMBERSHIP_USAGE: 'membership_usage', // 会员卡使用记录
} as const;

export type CollectionName = typeof Collections[keyof typeof Collections];
