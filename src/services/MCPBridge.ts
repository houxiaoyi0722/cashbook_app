import { api } from './api';
import { authManager } from './auth';
import { Flow } from '../types';

type Tool = {
  name: string;
  description: string;
  inputSchema: any;
  execute: (args: any,currentBook: any) => Promise<any>;
};

class MCPBridge {
  private tools: Map<string, Tool> = new Map();
  private listeners: Set<(event: string, data: any) => void> = new Set();

  constructor() {
    this.registerDefaultTools();
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
    this.notifyListeners('tool_added', tool);
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async callTool(toolName: string, args: any, currentBook?: {bookId: string, bookName?: string}): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`未找到工具: ${toolName}。可用工具: ${Array.from(this.tools.keys()).join(', ')}`);
    }

    try {
      if (tool.inputSchema) {
        this.validateArgs(args, tool.inputSchema);
      }

      // 修改工具执行函数以接收currentBook参数
      const result = await tool.execute(args, currentBook);

      this.notifyListeners('tool_called', {
        tool: toolName,
        args,
        result,
        timestamp: new Date(),
      });

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
        message: '工具调用成功',
      };
    } catch (error) {
      console.error(`工具调用失败 ${toolName}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const detailedMessage = `工具 ${toolName} 调用失败: ${errorMessage}`;

      this.notifyListeners('tool_error', {
        tool: toolName,
        args,
        error: detailedMessage,
        timestamp: new Date(),
      });

      throw new Error(detailedMessage);
    }
  }

  async callTools(calls: Array<{ tool: string; args: any }>, currentBook?: {bookId: string, bookName?: string}): Promise<any[]> {
    const results = [];
    for (const call of calls) {
      try {
        const result = await this.callTool(call.tool, call.args, currentBook);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          tool: call.tool,
        });
      }
    }
    return results;
  }

  private validateArgs(args: any, schema: any) {
    if (schema.required) {
      for (const field of schema.required) {
        if (args[field] === undefined || args[field] === null) {
          throw new Error(`缺少必需参数: ${field}`);
        }
        // 对于字符串，检查是否为空
        if (typeof args[field] === 'string' && args[field].trim() === '') {
          throw new Error(`参数 ${field} 不能为空字符串`);
        }
      }
    }

    // 验证参数类型
    if (schema.properties) {
      for (const [field, propSchema] of Object.entries(schema.properties) as [string, any][]) {
        if (args[field] !== undefined && args[field] !== null) {
          // 检查枚举值
          if (propSchema.enum && !propSchema.enum.includes(args[field])) {
            throw new Error(`参数 ${field} 必须是以下值之一: ${propSchema.enum.join(', ')}`);
          }

          // 检查数字范围
          if (propSchema.type === 'number') {
            if (typeof args[field] !== 'number' || isNaN(args[field])) {
              throw new Error(`参数 ${field} 必须是有效的数字`);
            }
            if (propSchema.minimum !== undefined && args[field] < propSchema.minimum) {
              throw new Error(`参数 ${field} 必须大于等于 ${propSchema.minimum}`);
            }
            if (propSchema.maximum !== undefined && args[field] > propSchema.maximum) {
              throw new Error(`参数 ${field} 必须小于等于 ${propSchema.maximum}`);
            }
          }

          // 检查字符串格式
          if (propSchema.type === 'string' && propSchema.format) {
            if (propSchema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(args[field])) {
              throw new Error(`参数 ${field} 必须是有效的日期格式 (YYYY-MM-DD)`);
            }
            if (propSchema.format === 'date-month' && !/^\d{4}-\d{2}$/.test(args[field])) {
              throw new Error(`参数 ${field} 必须是有效的月份格式 (YYYY-MM)`);
            }
          }
        }
      }
    }
  }

  private notifyListeners(event: string, data: any) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('监听器错误:', error);
      }
    });
  }

  addListener(listener: (event: string, data: any) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // 获取账本ID
  private async getBookId(currentBook?: {bookId: string, bookName?: string}): Promise<string> {
    // 如果传入了currentBook，直接使用
    if (currentBook && currentBook.bookId) {
      return currentBook.bookId;
    }
    console.error('获取账本ID失败:');
    throw new Error('获取账本ID失败');
  }

  private registerDefaultTools() {
    // 预算管理工具已添加：get_budget, update_budget, refresh_budget_usage
    // 平账管理工具已添加：get_balance_candidates, confirm_balance, ignore_balance_item, ignore_all_balance_items
    // 数据查询工具已添加：get_pay_types, get_attributions
    // 获取流水记录
    this.registerTool({
      name: 'get_flows',
      description: '获取指定时间范围内的流水记录，支持按流水类型、行业分类、支付方式、归属人等进行筛选，并支持分页查询',
      inputSchema: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            format: 'date',
            description: '开始日期，格式必须为YYYY-MM-DD，例如：2024-01-01。如果不提供，则默认为当前月份的第一天',
          },
          endDate: {
            type: 'string',
            format: 'date',
            description: '结束日期，格式必须为YYYY-MM-DD，例如：2024-12-31。如果不提供，则默认为当前日期',
          },
          flowType: {
            type: 'string',
            enum: ['收入', '支出', '不计收支'],
            description: '流水类型：收入（流入资金）、支出（流出资金）、不计收支（转账等不影响总余额的操作）',
          },
          industryType: {
            type: 'string',
            description: '行业分类，例如：餐饮美食、交通出行、日用百货等。如果不提供，则返回所有行业分类的流水',
          },
          payType: {
            type: 'string',
            description: '支付方式，例如：微信支付、支付宝、现金、银行卡等。如果不提供，则返回所有支付方式的流水',
          },
          attribution: {
            type: 'string',
            description: '归属人，表示该流水属于哪个家庭成员或账户。如果不提供，则返回所有归属人的流水',
          },
          pageNum: {
            type: 'number',
            minimum: 1,
            default: 1,
            description: '页码，从1开始。如果不提供，默认为第1页',
          },
          pageSize: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: '每页显示的记录数量，最小值为1，最大值为100。如果不提供，默认为20条',
          },
        },
      },
      execute: async (args, currentBook) => {
        const bookId = await this.getBookId(currentBook);

        // 验证日期格式
        if (args.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.startDate)) {
          throw new Error('开始日期格式必须为YYYY-MM-DD');
        }
        if (args.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.endDate)) {
          throw new Error('结束日期格式必须为YYYY-MM-DD');
        }

        // 转换参数格式
        const params: any = {
          bookId,
          startDay: args.startDate,
          endDay: args.endDate,
          flowType: args.flowType,
          industryType: args.industryType,
          payType: args.payType,
          attribution: args.attribution,
          pageNum: args.pageNum || 1,
          pageSize: args.pageSize || 20,
        };

        // 移除undefined或空字符串参数
        Object.keys(params).forEach(key => {
          if (params[key] === undefined || params[key] === '') {
            delete params[key];
          }
        });

        try {
          const response = await api.flow.page(params);
          if (response.c === 200) {
            return {
              flows: response.d.data,
              total: response.d.total,
              totalIn: response.d.totalIn,
              totalOut: response.d.totalOut,
              notInOut: response.d.notInOut,
              pageInfo: {
                currentPage: params.pageNum || 1,
                pageSize: params.pageSize || 20,
                totalPages: response.d.pages,
                hasMore: (params.pageNum || 1) < response.d.pages,
              },
            };
          } else {
            throw new Error(response.m || `获取流水记录失败: ${response.c}`);
          }
        } catch (error) {
          console.error('获取流水记录API调用失败:', error);
          throw new Error(`获取流水记录失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 创建流水记录
    this.registerTool({
      name: 'create_flow',
      description: '创建一条新的流水记录。需要提供流水名称、金额和流水类型等必需信息，其他信息可选。如果未提供日期，则使用当前日期',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '流水名称，例如：午餐消费、工资收入、房租支出等。不能为空字符串',
          },
          money: {
            type: 'number',
            description: '金额，不能小于0。',
          },
          flowType: {
            type: 'string',
            enum: ['收入', '支出', '不计收支'],
            description: '流水类型：收入（资金流入）、支出（资金流出）、不计收支（转账等不影响总余额的操作）',
          },
          industryType: {
            type: 'string',
            description: '行业分类，例如：餐饮美食、交通出行、日用百货等。通过industryType_flow工具选择最合适的，默认为"其他"',
          },
          payType: {
            type: 'string',
            description: '支付方式，例如：微信支付、支付宝、现金、银行卡等。如果不提供，默认为"其他"',
          },
          attribution: {
            type: 'string',
            description: '归属人，表示该流水属于哪个家庭成员或账户。如果用户未说明通过get_belonger工具获取',
          },
          description: {
            type: 'string',
            description: '流水描述，可以记录更多详细信息，例如：在某某餐厅用餐、购买了什么商品等',
          },
          date: {
            type: 'string',
            format: 'date',
            description: '流水发生的日期，格式必须为YYYY-MM-DD，例如：2024-12-09。如果不提供，则使用当前日期',
          },
        },
        required: ['name', 'money', 'flowType'],
      },
      execute: async (args, currentBook) => {
        // 验证必需参数
        if (!args.name || args.name.trim() === '') {
          throw new Error('流水名称不能为空');
        }
        if (args.money === undefined || args.money === null) {
          throw new Error('金额不能为空');
        }
        if (typeof args.money !== 'number' || isNaN(args.money)) {
          throw new Error('金额必须是有效的数字');
        }
        if (!args.flowType || !['收入', '支出', '不计收支'].includes(args.flowType)) {
          throw new Error('流水类型必须是"收入"、"支出"或"不计收支"');
        }

        const bookId = await this.getBookId(currentBook);

        // 处理日期参数
        let day = args.date;
        if (!day) {
          day = new Date().toISOString().split('T')[0];
        } else {
          // 验证日期格式
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(day)) {
            throw new Error('日期格式必须为YYYY-MM-DD');
          }
        }

        const flowData: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'> = {
          bookId,
          name: args.name.trim(),
          money: args.money,
          flowType: args.flowType,
          industryType: args.industryType?.trim() || '其他',
          payType: args.payType?.trim() || '其他',
          attribution: args.attribution?.trim() || '默认',
          description: args.description?.trim() || '',
          day: day,
        };

        try {
          const response = await api.flow.create(flowData);
          if (response.c === 200) {
            return {
              id: response.d.id,
              message: `已创建流水: ${flowData.name} - ¥${flowData.money}`,
              data: response.d,
            };
          } else {
            throw new Error(response.m || `创建流水失败: ${response.c}`);
          }
        } catch (error) {
          console.error('创建流水API调用失败:', error);
          throw new Error(`创建流水失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 行业类型
    this.registerTool({
      name: 'industryType_flow',
      description: '根据流水类型返回对应用户设定的支出类型。可根据上下文从其中判断选择合适的类型,如返回空列表可自主编写合适的类型',
      inputSchema: {
        type: 'object',
        properties: {
          flowType: {
            type: 'string',
            enum: ['收入', '支出', '不计收支'],
            description: '流水类型：收入（资金流入）、支出（资金流出）、不计收支（转账等不影响总余额的操作）',
          },
        },
        required: ['flowType'],
      },
      execute: async (args, currentBook) => {
        // 增强的分类逻辑
        const flowType = args.flowType;

        let suggestedIndustry = [''];

        // 尝试获取实际的行业类型列表
        try {
          const bookId = await this.getBookId(currentBook);
          const response = await api.flow.industryType(bookId, flowType);
          if (response.c === 200 && response.d.length > 0) {
            // 检查建议的分类是否在实际列表中
            suggestedIndustry = response.d.map(item => item.industryType);
          }
        } catch (error) {
          console.error('获取行业类型列表失败:', error);
          throw new Error(`获取行业类型列表失败: ${error}`);
        }

        return {
          suggestedIndustry,
        };
      },
    });

    // 获取预算信息
    this.registerTool({
      name: 'get_budget',
      description: '获取指定月份的预算信息，包括预算金额、已使用金额、剩余金额等',
      inputSchema: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            format: 'date-month',
            description: '月份，格式必须为YYYY-MM，例如：2024-12。如果不提供，则默认为当前月份',
          },
        },
      },
      execute: async (args, currentBook) => {
        const bookId = await this.getBookId(currentBook);
        const month = args.month || new Date().toISOString().slice(0, 7);

        try {
          const response = await api.budget.list(bookId, month);
          if (response.c === 200) {
            return {
              month,
              budgetData: response.d,
              message: `获取${month}预算信息成功`,
            };
          } else {
            throw new Error(response.m || '获取预算信息失败');
          }
        } catch (error) {
          console.error('获取预算API调用失败:', error);
          throw error;
        }
      },
    });

    // 更新月度预算
    this.registerTool({
      name: 'update_budget',
      description: '更新指定月份的预算金额。可以设置新的预算总额，系统会自动计算剩余金额。',
      inputSchema: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            format: 'date-month',
            description: '月份，格式必须为YYYY-MM，例如：2024-12。如果不提供，则默认为当前月份',
          },
          budget: {
            type: 'number',
            minimum: 0,
            description: '新的预算金额，必须大于等于0。',
          },
        },
        required: ['budget'],
      },
      execute: async (args, currentBook) => {
        const bookId = await this.getBookId(currentBook);
        const month = args.month || new Date().toISOString().slice(0, 7);
        const budget = args.budget;

        // 验证参数
        if (budget === undefined || budget === null) {
          throw new Error('预算金额不能为空');
        }
        if (typeof budget !== 'number' || isNaN(budget)) {
          throw new Error('预算金额必须是有效的数字');
        }
        if (budget < 0) {
          throw new Error('预算金额不能小于0');
        }

        // 验证月份格式
        if (month && !/^\d{4}-\d{2}$/.test(month)) {
          throw new Error('月份格式必须为YYYY-MM');
        }

        try {
          const response = await api.budget.update({
            bookId,
            month,
            budget,
          });
          if (response.c === 200) {
            return {
              success: true,
              month,
              budget,
              data: response.d,
              message: `已更新${month}的预算为¥${budget}`,
            };
          } else {
            throw new Error(response.m || `更新预算失败: ${response.c}`);
          }
        } catch (error) {
          console.error('更新预算API调用失败:', error);
          throw new Error(`更新预算失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 刷新预算使用金额
    this.registerTool({
      name: 'refresh_budget_usage',
      description: '刷新指定月份预算的已使用金额。系统会根据该月份的流水记录重新计算已使用的预算金额。',
      inputSchema: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            format: 'date-month',
            description: '月份，格式必须为YYYY-MM，例如：2024-12。如果不提供，则默认为当前月份',
          },
        },
      },
      execute: async (args, currentBook) => {
        const bookId = await this.getBookId(currentBook);
        const month = args.month || new Date().toISOString().slice(0, 7);

        // 验证月份格式
        if (month && !/^\d{4}-\d{2}$/.test(month)) {
          throw new Error('月份格式必须为YYYY-MM');
        }

        try {
          const response = await api.budget.reloadUsedAmount(bookId, month);
          if (response.c === 200) {
            return {
              success: true,
              month,
              data: response.d,
              message: `已刷新${month}的预算使用金额`,
            };
          } else {
            throw new Error(response.m || `刷新预算使用金额失败: ${response.c}`);
          }
        } catch (error) {
          console.error('刷新预算使用金额API调用失败:', error);
          throw new Error(`刷新预算使用金额失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 获取固定支出
    this.registerTool({
      name: 'get_fixed_flows',
      description: '**注意: 固定支出不会生成流水记录**获取指定月份的固定支出列表，固定支出是指每月定期发生的支出，例如：房租、房贷、订阅服务费',
      inputSchema: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            format: 'date-month',
            description: '月份，格式必须为YYYY-MM，例如：2024-12。如果不提供，则默认为当前月份',
          },
        },
      },
      execute: async (args, currentBook) => {
        const bookId = await this.getBookId(currentBook);
        const month = args.month || new Date().toISOString().slice(0, 7);

        try {
          const response = await api.fixedFlow.list(bookId, month);
          if (response.c === 200) {
            return {
              month,
              fixedFlows: response.d,
              count: Array.isArray(response.d) ? response.d.length : 0,
              message: `获取${month}固定支出成功`,
            };
          } else {
            throw new Error(response.m || '获取固定支出失败');
          }
        } catch (error) {
          console.error('获取固定支出API调用失败:', error);
          throw error;
        }
      },
    });

    // 获取分析数据
    this.registerTool({
      name: 'get_analytics',
      description: '获取各种维度的分析数据，包括按归属人、支付方式、行业分类或每日统计的分析结果',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['attribution', 'payType', 'industryType', 'daily'],
            description: '分析类型：attribution（按归属人分析）、payType（按支付方式分析）、industryType（按行业分类分析）、daily（每日统计）',
          },
          flowType: {
            type: 'string',
            enum: ['收入', '支出', '不计收支'],
            description: '流水类型：收入（只分析收入流水）、支出（只分析支出流水）、不计收支（只分析不计收支流水）。如果不提供，则分析所有类型的流水',
          },
          startDate: {
            type: 'string',
            format: 'date',
            description: '开始日期，格式必须为YYYY-MM-DD，例如：2024-01-01。如果不提供，则默认为当前月份的第一天',
          },
          endDate: {
            type: 'string',
            format: 'date',
            description: '结束日期，格式必须为YYYY-MM-DD，例如：2024-12-31。如果不提供，则默认为当前日期',
          },
        },
        required: ['type'],
      },
      execute: async (args, currentBook) => {
        const bookId = await this.getBookId(currentBook);

        const params: any = {
          bookId,
          flowType: args.flowType,
          startDay: args.startDate,
          endDay: args.endDate,
        };

        try {
          let response;
          switch (args.type) {
            case 'attribution':
              response = await api.analytics.attribution(params);
              break;
            case 'payType':
              response = await api.analytics.payType(params);
              break;
            case 'industryType':
              response = await api.analytics.industryType(params);
              break;
            case 'daily':
              response = await api.analytics.daily(bookId);
              break;
            default:
              throw new Error(`不支持的分析类型: ${args.type}`);
          }

          if (response.c === 200) {
            return {
              type: args.type,
              data: response.d,
              message: `获取${args.type}分析数据成功`,
            };
          } else {
            throw new Error(response.m || `获取${args.type}分析数据失败`);
          }
        } catch (error) {
          console.error('获取分析数据API调用失败:', error);
          throw error;
        }
      },
    });

    // 更新流水记录
    this.registerTool({
      name: 'update_flow',
      description: '更新现有的流水记录，可以修改流水的名称、金额、类型、行业分类、支付方式、归属人、描述等信息',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: '要更新的流水记录ID，必需参数',
          },
          name: {
            type: 'string',
            description: '流水名称，例如：午餐消费、工资收入、房租支出等',
          },
          money: {
            type: 'number',
            description: '金额，不能小于0',
          },
          flowType: {
            type: 'string',
            enum: ['收入', '支出', '不计收支'],
            description: '流水类型：收入（资金流入）、支出（资金流出）、不计收支（转账等不影响总余额的操作）',
          },
          industryType: {
            type: 'string',
            description: '行业分类，例如：餐饮美食、交通出行、日用百货等',
          },
          payType: {
            type: 'string',
            description: '支付方式，例如：微信支付、支付宝、现金、银行卡等',
          },
          attribution: {
            type: 'string',
            description: '归属人，表示该流水属于哪个家庭成员或账户',
          },
          description: {
            type: 'string',
            description: '流水描述，可以记录更多详细信息',
          },
          date: {
            type: 'string',
            format: 'date',
            description: '流水发生的日期，格式必须为YYYY-MM-DD，例如：2024-12-09',
          },
        },
        required: ['id'],
      },
      execute: async (args, currentBook) => {
        // 验证必需参数
        if (!args.id) {
          throw new Error('流水ID不能为空');
        }

        const bookId = await this.getBookId(currentBook);

        // 构建更新数据
        const updateData: any = {};

        // 只添加提供的字段
        if (args.name !== undefined) {
          if (typeof args.name === 'string' && args.name.trim() === '') {
            throw new Error('流水名称不能为空字符串');
          }
          updateData.name = args.name?.trim();
        }

        if (args.money !== undefined) {
          if (typeof args.money !== 'number' || isNaN(args.money)) {
            throw new Error('金额必须是有效的数字');
          }
          updateData.money = args.money;
        }

        if (args.flowType !== undefined) {
          if (!['收入', '支出', '不计收支'].includes(args.flowType)) {
            throw new Error('流水类型必须是"收入"、"支出"或"不计收支"');
          }
          updateData.flowType = args.flowType;
        }

        if (args.industryType !== undefined) {
          updateData.industryType = args.industryType?.trim();
        }

        if (args.payType !== undefined) {
          updateData.payType = args.payType?.trim();
        }

        if (args.attribution !== undefined) {
          updateData.attribution = args.attribution?.trim();
        }

        if (args.description !== undefined) {
          updateData.description = args.description?.trim();
        }

        if (args.date !== undefined) {
          // 验证日期格式
          if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
            throw new Error('日期格式必须为YYYY-MM-DD');
          }
          updateData.day = args.date;
        }

        // 检查是否有任何字段需要更新
        if (Object.keys(updateData).length === 0) {
          throw new Error('至少需要提供一个要更新的字段');
        }

        try {
          // 调用更新API，需要传递id和bookId
          const updatePayload = {
            id: args.id,
            bookId: bookId,
            ...updateData
          };

          const response = await api.flow.update(updatePayload);
          if (response.c === 200) {
            return {
              id: args.id,
              message: `已更新流水记录 #${args.id}`,
              data: response.d,
              updatedFields: Object.keys(updateData),
            };
          } else {
            throw new Error(response.m || `更新流水失败: ${response.c}`);
          }
        } catch (error) {
          console.error('更新流水API调用失败:', error);
          throw new Error(`更新流水失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 获取重复流水
    this.registerTool({
      name: 'get_duplicate_flows',
      description: '根据指定的条件查找重复的流水记录，支持按名称、描述、行业分类、流水类型、支付方式等条件进行去重分析',
      inputSchema: {
        type: 'object',
        properties: {
          criteria: {
            type: 'object',
            description: '重复检查条件对象，包含需要检查的字段',
            properties: {
              name: {
                type: 'boolean',
                description: '是否按流水名称检查重复',
                default: true,
              },
              description: {
                type: 'boolean',
                description: '是否按描述检查重复',
                default: false,
              },
              industryType: {
                type: 'boolean',
                description: '是否按行业分类检查重复',
                default: false,
              },
              flowType: {
                type: 'boolean',
                description: '是否按流水类型检查重复',
                default: false,
              },
              payType: {
                type: 'boolean',
                description: '是否按支付方式检查重复',
                default: false,
              },
            },
            default: {
              name: true,
              description: false,
              industryType: false,
              flowType: false,
              payType: false,
            },
          },
        },
      },
      execute: async (args, currentBook) => {
        const bookId = await this.getBookId(currentBook);

        // 构建请求参数，只包含API支持的参数
        const params: any = {
          bookId,
          criteria: args.criteria || {
            name: true,
            description: false,
            industryType: false,
            flowType: false,
            payType: false,
          },
        };

        try {
          const response = await api.flow.getDuplicateFlows(params);
          if (response.c === 200) {
            return {
              duplicateGroups: response.d.duplicateGroups || [],
              totalGroups: response.d.totalGroups || 0,
              totalDuplicates: response.d.totalDuplicates || 0,
              message: `找到 ${response.d.totalGroups || 0} 组重复流水，共 ${response.d.totalDuplicates || 0} 条重复记录`,
            };
          } else {
            throw new Error(response.m || `获取重复流水失败: ${response.c}`);
          }
        } catch (error) {
          console.error('获取重复流水API调用失败:', error);
          throw new Error(`获取重复流水失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 获取平账候选数据
    this.registerTool({
      name: 'get_balance_candidates',
      description: '获取可以相互抵消的支出和收入流水候选对，用于平账处理',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async (args, currentBook) => {
        const bookId = await this.getBookId(currentBook);

        // 构建请求参数，只包含bookId
        const params: any = {
          bookId,
        };

        try {
          const response = await api.flow.getBalanceCandidates(params);
          if (response.c === 200) {
            // 根据API响应结构，返回候选对数组
            return {
              candidates: response.d || [],
              message: `找到 ${Array.isArray(response.d) ? response.d.length : 0} 个平账候选对`,
            };
          } else {
            throw new Error(response.m || `获取平账候选数据失败: ${response.c}`);
          }
        } catch (error) {
          console.error('获取平账候选数据API调用失败:', error);
          throw new Error(`获取平账候选数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 确认平账
    this.registerTool({
      name: 'confirm_balance',
      description: '确认平账操作，将指定的支出流水和收入流水进行平账处理',
      inputSchema: {
        type: 'object',
        properties: {
          outId: {
            type: 'number',
            description: '支出流水ID，必需参数',
          },
          inIds: {
            type: 'array',
            description: '收入流水ID数组，必需参数',
            items: {
              type: 'number',
            },
            minItems: 1,
          },
        },
        required: ['outId', 'inIds'],
      },
      execute: async (args, currentBook) => {
        // 验证必需参数
        if (!args.outId) {
          throw new Error('支出流水ID不能为空');
        }
        if (!args.inIds || !Array.isArray(args.inIds) || args.inIds.length === 0) {
          throw new Error('收入流水ID数组不能为空');
        }

        const bookId = await this.getBookId(currentBook);

        // 构建请求参数，只包含API支持的参数
        const params: any = {
          bookId,
          outId: args.outId,
          inIds: args.inIds,
        };

        try {
          const response = await api.flow.confirmBalance(params);
          if (response.c === 200) {
            return {
              success: true,
              balanceId: response.d.balanceId,
              outFlow: response.d.outFlow,
              inFlows: response.d.inFlows,
              totalAmount: response.d.totalAmount,
              message: `平账操作成功，平账ID: ${response.d.balanceId}`,
            };
          } else {
            throw new Error(response.m || `确认平账失败: ${response.c}`);
          }
        } catch (error) {
          console.error('确认平账API调用失败:', error);
          throw new Error(`确认平账失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 忽略平账项
    this.registerTool({
      name: 'ignore_balance_item',
      description: '忽略指定的平账候选项，不再显示为平账候选',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: '流水ID，必需参数',
          },
        },
        required: ['id'],
      },
      execute: async (args, currentBook) => {
        // 验证必需参数
        if (!args.id) {
          throw new Error('流水ID不能为空');
        }

        const bookId = await this.getBookId(currentBook);

        // 构建请求参数，只包含API支持的参数
        const params: any = {
          bookId,
          flowId: args.id,
        };

        try {
          const response = await api.flow.ignoreBalanceItem(params);
          if (response.c === 200) {
            return {
              success: true,
              ignoredFlow: response.d,
              message: `已忽略流水 #${args.id} 的平账候选`,
            };
          } else {
            throw new Error(response.m || `忽略平账项失败: ${response.c}`);
          }
        } catch (error) {
          console.error('忽略平账项API调用失败:', error);
          throw new Error(`忽略平账项失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 忽略所有平账候选项
    this.registerTool({
      name: 'ignore_all_balance_items',
      description: '忽略所有平账候选项，不再显示任何平账候选。这是一个批量操作，可以一次性清除所有平账候选记录。',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            description: '要忽略的流水ID数组。如果不提供，系统将忽略当前账本中的所有平账候选项',
            items: {
              type: 'number',
            },
            minItems: 0,
          },
          confirm: {
            type: 'boolean',
            description: '确认操作标志，设置为true表示用户已确认要忽略所有平账候选项。这是一个重要操作，建议设置为true以避免误操作',
            default: false,
          },
        },
      },
      execute: async (args, currentBook) => {
        // 检查确认标志
        if (args.confirm !== true) {
          throw new Error('忽略所有平账候选项需要确认。请将confirm参数设置为true以确认操作。这是一个重要操作，将清除所有平账候选记录。');
        }

        const bookId = await this.getBookId(currentBook);

        // 构建请求参数
        const params: any = {
          bookId,
          ids: args.ids || [],
        };

        // 验证ids数组中的每个元素都是数字
        if (params.ids && Array.isArray(params.ids)) {
          for (let i = 0; i < params.ids.length; i++) {
            if (typeof params.ids[i] !== 'number' || isNaN(params.ids[i])) {
              throw new Error(`ids数组中的第${i + 1}个元素必须是有效的数字`);
            }
          }
        } else {
          params.ids = [];
        }

        try {
          const response = await api.flow.ignoreAllBalanceItems(params);
          if (response.c === 200) {
            return {
              success: true,
              ignoredCount: response.d || 0,
              message: `已成功忽略 ${response.d || 0} 个平账候选项`,
              timestamp: new Date().toISOString(),
            };
          } else {
            throw new Error(response.m || `忽略所有平账候选项失败: ${response.c}`);
          }
        } catch (error) {
          console.error('忽略所有平账候选项API调用失败:', error);
          throw new Error(`忽略所有平账候选项失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 删除流水记录
    this.registerTool({
      name: 'delete_flow',
      description: '删除指定的流水记录。这是一个高风险操作，删除后数据无法恢复，请谨慎使用。建议设置confirm参数为true以避免误操作。',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: '要删除的流水记录ID，必需参数。',
          },
          confirm: {
            type: 'boolean',
            description: '确认删除标志，设置为true表示用户已确认删除操作。强烈建议设置为true以避免误删除。',
            default: false,
          },
        },
        required: ['id'],
      },
      execute: async (args, currentBook) => {
        // 验证必需参数
        if (!args.id) {
          throw new Error('流水ID不能为空');
        }

        if (typeof args.id !== 'number' || isNaN(args.id) || args.id <= 0) {
          throw new Error('流水ID必须是有效的正整数');
        }

        // 检查确认标志
        if (args.confirm !== true) {
          throw new Error('删除操作需要确认。请将confirm参数设置为true以确认删除。这是一个高风险操作，删除后数据无法恢复。');
        }

        const bookId = await this.getBookId(currentBook);

        try {
          // 调用删除API - 注意：api.flow.delete接受两个独立参数：id和bookId
          const response = await api.flow.delete(args.id, bookId);

          if (response.c === 200) {
            return {
              success: true,
              id: args.id,
              message: `已成功删除流水记录 #${args.id}`,
              // 注意：由于API返回void类型，response.d为undefined
              // 我们不返回data字段，或者返回null
              timestamp: new Date().toISOString(),
              warning: '此操作已永久删除数据，无法恢复。',
            };
          } else {
            throw new Error(response.m || `删除流水失败: ${response.c}`);
          }
        } catch (error) {
          console.error('删除流水API调用失败:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`删除流水记录失败: ${errorMessage}`);
        }
      },
    });

    // 添加固定支出
    this.registerTool({
      name: 'add_fixed_flow',
      description: '**注意: 固定支出不会生成流水记录** 添加一个新的固定支出记录。固定支出是指每月定期发生的支出，例如：房租、房贷、订阅服务费等。需要提供名称、金额、归属人、开始月份和结束月份等必需信息。',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '固定支出名称，例如：房租、房贷、Netflix订阅费等。不能为空字符串',
          },
          money: {
            type: 'number',
            description: '每月固定支出金额，必须大于0',
          },
          attribution: {
            type: 'string',
            description: '归属人，表示该固定支出属于哪个家庭成员或账户。必需参数',
          },
          startMonth: {
            type: 'string',
            format: 'date-month',
            description: '开始月份，格式必须为YYYY-MM，例如：2024-12。表示固定支出从哪个月开始生效',
          },
          endMonth: {
            type: 'string',
            format: 'date-month',
            description: '结束月份，格式必须为YYYY-MM，例如：2025-12。表示固定支出到哪个月结束。如果不提供，默认为开始月份后的12个月',
          },
          description: {
            type: 'string',
            description: '固定支出描述，可以记录更多详细信息',
          },
          flowType: {
            type: 'string',
            enum: ['收入', '支出', '不计收支'],
            description: '流水类型：收入（资金流入）、支出（资金流出）、不计收支（转账等不影响总余额的操作）。如果不提供，默认为"支出"',
            default: '支出',
          },
          industryType: {
            type: 'string',
            description: '行业分类，例如：房租、贷款、订阅服务等。如果不提供，默认为"固定支出"',
          },
          payType: {
            type: 'string',
            description: '支付方式，例如：银行转账、自动扣款、现金等。如果不提供，默认为"银行转账"',
          },
        },
        required: ['name', 'money', 'attribution', 'startMonth'],
      },
      execute: async (args, currentBook) => {
        // 验证必需参数
        if (!args.name || args.name.trim() === '') {
          throw new Error('固定支出名称不能为空');
        }
        if (args.money === undefined || args.money === null) {
          throw new Error('金额不能为空');
        }
        if (typeof args.money !== 'number' || isNaN(args.money) || args.money <= 0) {
          throw new Error('金额必须是大于0的有效数字');
        }
        if (!args.attribution || args.attribution.trim() === '') {
          throw new Error('归属人不能为空');
        }
        if (!args.startMonth || !/^\d{4}-\d{2}$/.test(args.startMonth)) {
          throw new Error('开始月份格式必须为YYYY-MM');
        }

        const bookId = await this.getBookId(currentBook);

        // 处理结束月份：如果不提供，默认为开始月份后的12个月
        let endMonth = args.endMonth;
        if (!endMonth) {
          const startDate = new Date(args.startMonth + '-01');
          startDate.setMonth(startDate.getMonth() + 12);
          endMonth = startDate.toISOString().slice(0, 7);
        } else {
          if (!/^\d{4}-\d{2}$/.test(endMonth)) {
            throw new Error('结束月份格式必须为YYYY-MM');
          }
        }

        // 构建请求数据
        const fixedFlowData: any = {
          bookId,
          name: args.name.trim(),
          money: args.money,
          attribution: args.attribution.trim(),
          startMonth: args.startMonth,
          endMonth: endMonth,
          description: args.description?.trim() || '',
          flowType: args.flowType || '支出',
          industryType: args.industryType?.trim() || '固定支出',
          payType: args.payType?.trim() || '银行转账',
          month: args.startMonth, // API可能需要month参数
        };

        try {
          const response = await api.fixedFlow.add(fixedFlowData);
          if (response.c === 200) {
            return {
              success: true,
              id: response.d?.id,
              message: `已添加固定支出: ${fixedFlowData.name} - ¥${fixedFlowData.money}/月`,
              data: response.d,
            };
          } else {
            throw new Error(response.m || `添加固定支出失败: ${response.c}`);
          }
        } catch (error) {
          console.error('添加固定支出API调用失败:', error);
          throw new Error(`添加固定支出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 更新固定支出
    this.registerTool({
      name: 'update_fixed_flow',
      description: '**注意: 固定支出不会生成流水记录**更新现有的固定支出记录。可以修改固定支出的名称、金额、归属人、开始月份、结束月份、描述等信息。',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: '要更新的固定支出记录ID，必需参数',
          },
          name: {
            type: 'string',
            description: '固定支出名称，例如：房租、房贷、Netflix订阅费等',
          },
          money: {
            type: 'number',
            description: '每月固定支出金额，必须大于0',
          },
          attribution: {
            type: 'string',
            description: '归属人，表示该固定支出属于哪个家庭成员或账户',
          },
          startMonth: {
            type: 'string',
            format: 'date-month',
            description: '开始月份，格式必须为YYYY-MM，例如：2024-12',
          },
          endMonth: {
            type: 'string',
            format: 'date-month',
            description: '结束月份，格式必须为YYYY-MM，例如：2025-12',
          },
          description: {
            type: 'string',
            description: '固定支出描述，可以记录更多详细信息',
          },
          flowType: {
            type: 'string',
            enum: ['收入', '支出', '不计收支'],
            description: '流水类型：收入（资金流入）、支出（资金流出）、不计收支（转账等不影响总余额的操作）',
          },
          industryType: {
            type: 'string',
            description: '行业分类，例如：房租、贷款、订阅服务等',
          },
          payType: {
            type: 'string',
            description: '支付方式，例如：银行转账、自动扣款、现金等',
          },
        },
        required: ['id'],
      },
      execute: async (args, currentBook) => {
        // 验证必需参数
        if (!args.id) {
          throw new Error('固定支出ID不能为空');
        }

        const bookId = await this.getBookId(currentBook);

        // 构建更新数据
        const updateData: any = {
          id: args.id,
          bookId,
        };

        // 只添加提供的字段
        if (args.name !== undefined) {
          if (typeof args.name === 'string' && args.name.trim() === '') {
            throw new Error('固定支出名称不能为空字符串');
          }
          updateData.name = args.name.trim();
        }

        if (args.money !== undefined) {
          if (typeof args.money !== 'number' || isNaN(args.money) || args.money <= 0) {
            throw new Error('金额必须是大于0的有效数字');
          }
          updateData.money = args.money;
        }

        if (args.attribution !== undefined) {
          if (args.attribution.trim() === '') {
            throw new Error('归属人不能为空字符串');
          }
          updateData.attribution = args.attribution.trim();
        }

        if (args.startMonth !== undefined) {
          if (!/^\d{4}-\d{2}$/.test(args.startMonth)) {
            throw new Error('开始月份格式必须为YYYY-MM');
          }
          updateData.startMonth = args.startMonth;
        }

        if (args.endMonth !== undefined) {
          if (!/^\d{4}-\d{2}$/.test(args.endMonth)) {
            throw new Error('结束月份格式必须为YYYY-MM');
          }
          updateData.endMonth = args.endMonth;
        }

        if (args.description !== undefined) {
          updateData.description = args.description?.trim();
        }

        if (args.flowType !== undefined) {
          if (!['收入', '支出', '不计收支'].includes(args.flowType)) {
            throw new Error('流水类型必须是"收入"、"支出"或"不计收支"');
          }
          updateData.flowType = args.flowType;
        }

        if (args.industryType !== undefined) {
          updateData.industryType = args.industryType?.trim();
        }

        if (args.payType !== undefined) {
          updateData.payType = args.payType?.trim();
        }

        // 检查是否有任何字段需要更新
        if (Object.keys(updateData).length <= 2) { // 只有id和bookId
          throw new Error('至少需要提供一个要更新的字段');
        }

        try {
          const response = await api.fixedFlow.update(updateData);
          if (response.c === 200) {
            return {
              success: true,
              id: args.id,
              message: `已更新固定支出记录 #${args.id}`,
              data: response.d,
              updatedFields: Object.keys(updateData).filter(key => !['id', 'bookId'].includes(key)),
            };
          } else {
            throw new Error(response.m || `更新固定支出失败: ${response.c}`);
          }
        } catch (error) {
          console.error('更新固定支出API调用失败:', error);
          throw new Error(`更新固定支出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    // 删除固定支出
    this.registerTool({
      name: 'delete_fixed_flow',
      description: '删除指定的固定支出记录。这是一个高风险操作，删除后数据无法恢复，请谨慎使用。建议设置confirm参数为true以避免误操作。',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: '要删除的固定支出记录ID，必需参数',
          },
          confirm: {
            type: 'boolean',
            description: '确认删除标志，设置为true表示用户已确认删除操作。强烈建议设置为true以避免误删除',
            default: false,
          },
        },
        required: ['id'],
      },
      execute: async (args, currentBook) => {
        // 验证必需参数
        if (!args.id) {
          throw new Error('固定支出ID不能为空');
        }

        if (typeof args.id !== 'number' || isNaN(args.id) || args.id <= 0) {
          throw new Error('固定支出ID必须是有效的正整数');
        }

        // 检查确认标志
        if (args.confirm !== true) {
          throw new Error('删除操作需要确认。请将confirm参数设置为true以确认删除。这是一个高风险操作，删除后数据无法恢复。');
        }

        const bookId = await this.getBookId(currentBook);

        try {
          const response = await api.fixedFlow.delete(args.id, bookId);
          if (response.c === 200) {
            return {
              success: true,
              id: args.id,
              message: `已成功删除固定支出记录 #${args.id}`,
              timestamp: new Date().toISOString(),
              warning: '此操作已永久删除数据，无法恢复。',
            };
          } else {
            throw new Error(response.m || `删除固定支出失败: ${response.c}`);
          }
        } catch (error) {
          console.error('删除固定支出API调用失败:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`删除固定支出记录失败: ${errorMessage}`);
        }
      },
    });

    // 获取支付方式列表
    this.registerTool({
      name: 'get_pay_types',
      description: '获取当前账本中可用的支付方式列表，例如：微信支付、支付宝、现金、银行卡等。返回一个包含所有支付方式的数组。',
      inputSchema: {
        type: 'object',
        properties: {
          // 此工具不需要输入参数，但为了保持一致性，保留空对象
        },
        required: [],
      },
      execute: async (args, currentBook) => {
        try {
          const bookId = await this.getBookId(currentBook);

          if (!bookId || bookId.trim() === '') {
            throw new Error('无法获取有效的账本ID');
          }

          const response = await api.flow.payType(bookId);

          if (response.c === 200) {
            // 处理响应数据：api.flow.payType 返回的是 [{payType: string}] 格式
            const payTypes = response.d?.map(item => item.payType) || [];

            return {
              success: true,
              payTypes,
              count: payTypes.length,
              message: `获取到 ${payTypes.length} 种支付方式`,
              data: response.d,
            };
          } else {
            throw new Error(response.m || `获取支付方式列表失败: ${response.c}`);
          }
        } catch (error) {
          console.error('获取支付方式列表失败:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`获取支付方式列表失败: ${errorMessage}`);
        }
      },
    });

    // 获取归属人列表
    this.registerTool({
      name: 'get_attributions',
      description: '获取当前账本中可用的归属人列表。归属人表示流水属于哪个家庭成员或账户。返回一个包含所有归属人的数组。',
      inputSchema: {
        type: 'object',
        properties: {
          // 此工具不需要输入参数，但为了保持一致性，保留空对象
        },
        required: [],
      },
      execute: async (args, currentBook) => {
        try {
          const bookId = await this.getBookId(currentBook);

          if (!bookId || bookId.trim() === '') {
            throw new Error('无法获取有效的账本ID');
          }

          const response = await api.flow.attributions(bookId);

          if (response.c === 200) {
            // 处理响应数据：api.flow.attributions 返回的是 string[] 格式
            const attributions = response.d || [];

            return {
              success: true,
              attributions,
              count: attributions.length,
              message: `获取到 ${attributions.length} 个归属人`,
              data: response.d,
            };
          } else {
            throw new Error(response.m || `获取归属人列表失败: ${response.c}`);
          }
        } catch (error) {
          console.error('获取归属人列表失败:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`获取归属人列表失败: ${errorMessage}`);
        }
      },
    });

    // 获取归属人信息
    this.registerTool({
      name: 'get_belonger',
      description: '获取当前登录用户的归属人信息，返回用户姓名和邮箱。如果用户未登录，返回空信息。',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (args, currentBook) => {
        try {
          const userInfo = await authManager.getCurrentUser();

          if (userInfo) {
            return {
              success: true,
              user: {
                name: userInfo.name,
                email: userInfo.email,
                id: userInfo.id,
              },
              message: '已获取当前用户信息',
              isLoggedIn: true,
            };
          } else {
            return {
              success: true,
              user: null,
              message: '用户未登录',
              isLoggedIn: false,
            };
          }
        } catch (error) {
          console.error('获取用户信息失败:', error);
          return {
            success: false,
            user: null,
            message: `获取用户信息失败: ${error instanceof Error ? error.message : String(error)}`,
            isLoggedIn: false,
          };
        }
      },
    });
  }
}

export const mcpBridge = new MCPBridge();
