/**
 * 格式化金额为固定两位小数
 * 安全处理各种类型的输入值，避免出现 undefined 或 null 导致的错误
 *
 * @param value 要格式化的金额值
 * @param defaultValue 默认值，当输入无效时返回
 * @returns 格式化后的金额字符串
 */
export const formatMoney = (value: any, defaultValue: string = '0.00'): string => {
  // 如果值为 null 或 undefined，返回默认值
  if (value === null || value === undefined) {
    return defaultValue;
  }

  // 尝试转换为数字
  const numValue = Number(value);

  // 检查是否为有效数字
  if (isNaN(numValue)) {
    return defaultValue;
  }

  // 格式化为两位小数
  return numValue.toFixed(2);
};

/**
 * 格式化收入金额，添加正号前缀
 *
 * @param value 要格式化的金额值
 * @param defaultValue 默认值，当输入无效时返回
 * @returns 格式化后的金额字符串
 */
export const formatIncomeAmount = (value: any, defaultValue: string = '0.00'): string => {
  const formatted = formatMoney(value, defaultValue);
  // 如果不是默认值且为正数或零，添加+号
  return formatted !== defaultValue ? `+${formatted}` : formatted;
};

/**
 * 格式化支出金额，添加负号前缀
 *
 * @param value 要格式化的金额值
 * @param defaultValue 默认值，当输入无效时返回
 * @returns 格式化后的金额字符串
 */
export const formatExpenseAmount = (value: any, defaultValue: string = '0.00'): string => {
  const formatted = formatMoney(value, defaultValue);
  // 如果不是默认值，添加-号
  return formatted !== defaultValue ? `-${formatted}` : formatted;
};

/**
 * 格式化日期字符串
 *
 * @param dateStr 日期字符串
 * @param format 格式化模式，默认为 'YYYY-MM-DD'
 * @returns 格式化后的日期字符串
 */
export const formatDate = (dateStr: string | null | undefined, format: string = 'YYYY-MM-DD'): string => {
  if (!dateStr) {
    return '';
  }

  try {
    const date = new Date(dateStr);

    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      return '';
    }

    // 简单格式化，可以根据需要扩展
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (format === 'YYYY-MM-DD') {
      return `${year}-${month}-${day}`;
    } else if (format === 'YYYY-MM') {
      return `${year}-${month}`;
    } else if (format === 'MM-DD') {
      return `${month}-${day}`;
    }

    return `${year}-${month}-${day}`;
  } catch (error) {
    return '';
  }
};
