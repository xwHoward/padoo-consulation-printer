/**
 * 顾客服务层
 * 统一顾客搜索和匹配逻辑
 */

export interface MatchCustomerParams {
  surname?: string;
  gender?: 'male' | 'female' | '';
  phone?: string;
}

export interface MatchCustomerResult {
  customer: CustomerRecord | null;
  error?: string;
}

/**
 * 匹配顾客
 * 通过姓名、性别、手机号匹配顾客记录
 */
export async function matchCustomer(params: MatchCustomerParams): Promise<MatchCustomerResult> {
  const { surname, gender, phone } = params;

  // 如果没有输入任何信息，返回null
  if (!surname && !phone) {
    return { customer: null };
  }

  try {
    const res = await wx.cloud.callFunction({
      name: 'matchCustomer',
      data: {
        surname: surname || '',
        gender: gender || '',
        phone: phone || ''
      }
    });

    if (!res.result || typeof res.result !== 'object') {
      return { customer: null, error: '匹配顾客失败' };
    }

    const result = res.result as { code: number; data?: CustomerRecord; message?: string };
    
    if (result.code === 0 && result.data) {
      return { customer: result.data };
    }

    return { customer: null };
  } catch (error) {
    console.error('[CustomerService] 匹配顾客失败:', error);
    return { 
      customer: null, 
      error: error instanceof Error ? error.message : '匹配顾客失败' 
    };
  }
}

/**
 * 从顾客姓名中提取姓氏和性别
 */
export function parseCustomerName(fullName: string): { surname: string; gender: 'male' | 'female' } {
  const surname = fullName.replace(/先生|女士/g, '');
  const gender: 'male' | 'female' = fullName.endsWith('女士') ? 'female' : 'male';
  return { surname, gender };
}

/**
 * 构建车牌号相关的更新数据
 */
export function buildPlateNumberUpdates(licensePlate: string): {
  licensePlate: string;
  plateNumber: string[];
} {
  const isNewEnergyVehicle = licensePlate.length === 8;
  const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
  const plateNumber = Array(maxPlateLength).fill('');
  const plateChars = licensePlate.split('');

  plateChars.forEach((char, index) => {
    if (index < maxPlateLength) {
      plateNumber[index] = char;
    }
  });

  return {
    licensePlate,
    plateNumber
  };
}
