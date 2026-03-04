/**
 * 统一的 Loading 锁服务
 * 提供防重复提交和统一的 loading 状态管理
 */

interface PageWithLoading {
  data: { loading: boolean; loadingText: string };
  setData: (data: Partial<{ loading: boolean; loadingText: string }>) => void;
}

interface LoadingOptions {
  /** loading 提示文字 */
  loadingText?: string;
  /** 成功时的提示文字，为空则不显示 */
  successText?: string;
  /** 失败时的提示文字，为空则显示默认错误信息 */
  errorText?: string;
  /** 是否显示成功提示 */
  showSuccessToast?: boolean;
  /** 是否显示错误提示 */
  showErrorToast?: boolean;
  /** 锁的唯一标识，用于防止同一操作重复执行 */
  lockKey?: string;
}

const DEFAULT_OPTIONS: LoadingOptions = {
  loadingText: '加载中...',
  successText: '操作成功',
  errorText: '操作失败',
  showSuccessToast: false,
  showErrorToast: true,
};

class LoadingService {
  /** 存储各个锁的状态 */
  private locks: Map<string, boolean> = new Map();
  
  /** 全局锁计数器，用于生成唯一锁ID */
  private lockCounter: number = 0;

  /**
   * 检查指定锁是否已被占用
   */
  isLocked(lockKey: string): boolean {
    return this.locks.get(lockKey) === true;
  }

  /**
   * 获取锁
   * @returns 是否成功获取锁
   */
  acquireLock(lockKey: string): boolean {
    if (this.isLocked(lockKey)) {
      return false;
    }
    this.locks.set(lockKey, true);
    return true;
  }

  /**
   * 释放锁
   */
  releaseLock(lockKey: string): void {
    this.locks.delete(lockKey);
  }

  /**
   * 生成唯一锁ID
   */
  generateLockKey(): string {
    return `lock_${++this.lockCounter}_${Date.now()}`;
  }

  /**
   * 包装异步函数，自动处理 loading 状态和防重复提交
   * @param page 页面实例
   * @param fn 要执行的异步函数
   * @param options 配置选项
   */
  async withLoading<T>(
    page: PageWithLoading,
    fn: () => Promise<T>,
    options?: LoadingOptions
  ): Promise<T | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lockKey = opts.lockKey || this.generateLockKey();

    // 检查是否已有相同操作在执行
    if (opts.lockKey && this.isLocked(lockKey)) {
      console.warn(`[LoadingService] 操作 ${lockKey} 正在执行中，跳过重复请求`);
      return null;
    }

    // 获取锁
    if (opts.lockKey) {
      this.acquireLock(lockKey);
    }

    // 显示 loading
    page.setData({
      loading: true,
      loadingText: opts.loadingText || '加载中...'
    });

    try {
      const result = await fn();

      // 显示成功提示
      if (opts.showSuccessToast && opts.successText) {
        wx.showToast({
          title: opts.successText,
          icon: 'success'
        });
      }

      return result;
    } catch (error) {
      console.error('[LoadingService] 操作失败:', error);

      // 显示错误提示
      if (opts.showErrorToast) {
        const errorMsg = error instanceof Error 
          ? error.message 
          : (opts.errorText || '操作失败');
        wx.showToast({
          title: errorMsg,
          icon: 'none'
        });
      }

      return null;
    } finally {
      // 隐藏 loading
      page.setData({ loading: false });

      // 释放锁
      if (opts.lockKey) {
        this.releaseLock(lockKey);
      }
    }
  }

  /**
   * 带锁的操作执行器（不显示 loading UI）
   * 用于需要防重复但不需要显示 loading 的场景
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    onLocked?: () => void
  ): Promise<T | null> {
    if (this.isLocked(lockKey)) {
      onLocked?.();
      return null;
    }

    this.acquireLock(lockKey);
    try {
      return await fn();
    } finally {
      this.releaseLock(lockKey);
    }
  }

  /**
   * 批量执行异步操作（带 loading）
   * @param page 页面实例
   * @param tasks 异步任务数组
   * @param options 配置选项
   */
  async withLoadingBatch<T>(
    page: PageWithLoading,
    tasks: Array<() => Promise<T>>,
    options?: LoadingOptions & { parallel?: boolean }
  ): Promise<Array<T | null>> {
    const opts = { ...DEFAULT_OPTIONS, parallel: true, ...options };
    const lockKey = opts.lockKey || this.generateLockKey();

    if (opts.lockKey && this.isLocked(lockKey)) {
      return tasks.map(() => null);
    }

    if (opts.lockKey) {
      this.acquireLock(lockKey);
    }

    page.setData({
      loading: true,
      loadingText: opts.loadingText || '加载中...'
    });

    try {
      let results: Array<T | null>;
      
      if (opts.parallel) {
        // 并行执行
        const settledResults = await Promise.allSettled(tasks.map(t => t()));
        results = settledResults.map(r => 
          r.status === 'fulfilled' ? r.value : null
        );
      } else {
        // 串行执行
        results = [];
        for (const task of tasks) {
          try {
            results.push(await task());
          } catch {
            results.push(null);
          }
        }
      }

      if (opts.showSuccessToast && opts.successText) {
        wx.showToast({
          title: opts.successText,
          icon: 'success'
        });
      }

      return results;
    } catch (error) {
      if (opts.showErrorToast) {
        wx.showToast({
          title: opts.errorText || '操作失败',
          icon: 'none'
        });
      }
      return tasks.map(() => null);
    } finally {
      page.setData({ loading: false });
      if (opts.lockKey) {
        this.releaseLock(lockKey);
      }
    }
  }

  /**
   * 清除所有锁（用于页面卸载时清理）
   */
  clearAllLocks(): void {
    this.locks.clear();
  }
}

/** 全局单例 */
export const loadingService = new LoadingService();

/** 常用锁标识常量 */
export const LockKeys = {
  // cashier 页面
  LOAD_CASHIER_DATA: 'cashier:loadData',
  REFRESH_ROTATION: 'cashier:refreshRotation',
  ADJUST_ROTATION: 'cashier:adjustRotation',
  SAVE_RESERVATION: 'cashier:saveReservation',
  CANCEL_RESERVATION: 'cashier:cancelReservation',
  SETTLEMENT: 'cashier:settlement',
  PUSH_ROTATION: 'cashier:pushRotation',
  
  // history 页面
  LOAD_HISTORY: 'history:loadData',
  VOID_CONSULTATION: 'history:void',
  DELETE_CONSULTATION: 'history:delete',
  EARLY_FINISH: 'history:earlyFinish',
  EXTRA_TIME: 'history:extraTime',
  GENERATE_SUMMARY: 'history:generateSummary',
  PUSH_SUMMARY: 'history:pushSummary',
  
  // index 页面
  LOAD_INDEX_DATA: 'index:loadData',
  SAVE_CONSULTATION: 'index:save',
  CLOCK_IN: 'index:clockIn',
  SEARCH_CUSTOMER: 'index:searchCustomer',
  
  // analytics 页面
  LOAD_ANALYTICS: 'analytics:loadData',
  
  // membership 页面
  SAVE_MEMBERSHIP: 'membership:save',
  TOGGLE_MEMBERSHIP_STATUS: 'membership:toggleStatus',
  DELETE_MEMBERSHIP: 'membership:delete',
} as const;
