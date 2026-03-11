// ============ 云函数返回值类型定义 ============

/**
 * 云函数通用返回值类型
 */
interface CloudFunctionResult<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

/**
 * 云函数调用原始返回类型
 */
interface CloudCallResult<T = unknown> {
  result: CloudFunctionResult<T> | null;
  errMsg?: string;
}

/**
 * 技师可用性列表 - getAvailableTechnicians 云函数返回
 */
type GetAvailableTechniciansResult = CloudFunctionResult<StaffAvailability[]>;

/**
 * 顾客匹配结果 - matchCustomer 云函数返回
 */
type MatchCustomerResult = CloudFunctionResult<CustomerRecord>;

/**
 * 发送消息结果 - sendWechatMessage 云函数返回
 */
type SendWechatMessageResult = CloudFunctionResult<void>;

/**
 * 获取所有数据结果 - getAll 云函数返回
 */
type GetAllResult<T> = CloudFunctionResult<T[]>;

/**
 * 技师统计数据
 */
interface TechnicianStats {
  totalCount: number;
  clockInCount: number;
  extraTimeTotal: number;
  extraTimeCount: number;
  overtimeHours: number;
  shift: string;
  projects: Record<string, number>;
}

interface MonthlyScoreRanking {
	period: {
		year: number;
		month: number;
		startDate: string;
		endDate: string;
	};
	rankings:{
  technician: string;
  salesCount: number;
  clockInCount: number;
  totalScore: number;
  rank:number;
	}[];
}

/**
 * 数据加载服务使用的兼容性函数类型
 */
type EnsureConsultationInfoCompatibilityFn = (
  data: ConsultationInfo,
  projects?: Project[]
) => Update<ConsultationInfo>;
