import { mcpBridge } from './MCPBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventSource from 'react-native-sse';
import {
  Message,
} from '../types';
import { AIRecursiveService } from './AIRecursiveService';
import {StreamMessageParser} from "./StreamMessageParser.ts";
// AIConfigService will be imported dynamically in generatePromptSuggestions to avoid circular dependencies

export interface AIResponse {
  messages?: Message[]; // 新增：结构化的消息数组
  text?: string; // 改为可选，因为现在主要通过messages返回
  thinking?: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
  }>;
  error?: string;
  streamCallback?: (content: string, isComplete: boolean) => void;
}

// 新的回调函数类型
export type MessageStreamCallback = (message: Message, isComplete: boolean) => void;

export class AIService {
  private conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }> = [];

  currentBookId: string | null = null;
  currentBookName: string | null = null;
  streamParser: StreamMessageParser | undefined;

  // 更新当前账本信息
  updateBookInfo(bookId: string | null, bookName?: string | null) {
    this.currentBookId = bookId;
    this.currentBookName = bookName || null;
    console.log(`AIService: 当前账本已更新为 ${bookId} (${bookName})`);
  }

  async sendMessage(userMessage: string, streamCallback?: MessageStreamCallback): Promise<AIResponse> {
    this.streamParser = new StreamMessageParser();
    // 创建递归服务实例
    const recursiveService = new AIRecursiveService(this);
    // 调用递归函数
    return recursiveService.sendMessageRecursive(userMessage, streamCallback);
  }

  async getContext(): Promise<any> {
    try {
      // 获取用户信息
      const userInfoStr = await AsyncStorage.getItem('user_info');
      let userInfo = null;
      if (userInfoStr) {
        try {
          userInfo = JSON.parse(userInfoStr);
        } catch (parseError) {
          console.warn('解析用户信息失败:', parseError);
        }
      }

      // 获取服务器配置
      const serverConfigStr = await AsyncStorage.getItem('server_config');
      let serverConfig = null;
      if (serverConfigStr) {
        try {
          serverConfig = JSON.parse(serverConfigStr);
        } catch (parseError) {
          console.warn('解析服务器配置失败:', parseError);
        }
      }

      // 优先使用AIService中存储的当前账本信息
      let currentBook = null;
      if (this.currentBookId) {
        currentBook = {
          id: this.currentBookId,
          bookId: this.currentBookId,
          bookName: this.currentBookName || '当前账本',
          createDate: new Date().toISOString(), // 使用当前时间作为占位符
        };
      }

      const context = {
        user: userInfo ? {
          id: userInfo.id,
          name: userInfo.name,
          email: userInfo.email,
        } : null,
        currentBook: currentBook,
        server: serverConfig ? {
          name: serverConfig.name,
          url: serverConfig.url,
        } : null,
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString('zh-CN'),
      };

      console.log('📋 获取上下文成功', {
        hasUser: !!context.user,
        hasBook: !!context.currentBook,
        hasServer: !!context.server,
        bookId: this.currentBookId,
        bookName: this.currentBookName,
        currentBookInfo: currentBook,
      });

      return context;

    } catch (error) {
      console.error('❌ 获取上下文失败:', error instanceof Error ? error.message : String(error));
      // 返回默认上下文
      return {
        user: null,
        currentBook: null,
        server: null,
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString('zh-CN'),
        error: '无法获取完整上下文信息',
      };
    }
  }

  buildSystemPrompt(context: any): string {
    const tools = mcpBridge.getTools();

    // 为每个工具创建详细的参数说明表格
    const toolsDetailedDescription = tools.map(tool => {
      let toolInfo = `## ${tool.name}\n`;
      toolInfo += `**描述**: ${tool.description}\n\n`;

      // 添加参数说明
      if (tool.inputSchema && tool.inputSchema.properties) {
        toolInfo += '**参数说明**:\n';
        const props = tool.inputSchema.properties;
        const required = tool.inputSchema.required || [];

        // 创建参数表格
        toolInfo += '| 参数名 | 类型 | 必需 | 格式/枚举 | 示例值 | 描述 |\n';
        toolInfo += '|--------|------|------|-----------|--------|------|\n';

        for (const [paramName, paramSchema] of Object.entries(props) as [string, any][]) {
          const isRequired = required.includes(paramName) ? '是' : '否';
          let typeInfo = paramSchema.type || 'any';
          let formatEnum = '';

          if (paramSchema.enum) {
            formatEnum = `枚举: ${paramSchema.enum.join(', ')}`;
          } else if (paramSchema.format) {
            formatEnum = `格式: ${paramSchema.format}`;
          } else if (paramSchema.minimum !== undefined || paramSchema.maximum !== undefined) {
            const min = paramSchema.minimum !== undefined ? `≥${paramSchema.minimum}` : '';
            const max = paramSchema.maximum !== undefined ? `≤${paramSchema.maximum}` : '';
            formatEnum = `范围: ${min}${min && max ? '~' : ''}${max}`;
          }

          // 获取示例值
          let example = '';
          switch (paramName) {
            case 'name':
              example = '"午餐消费"';
              break;
            case 'money':
              example = '50.5';
              break;
            case 'flowType':
              example = '"支出"';
              break;
            case 'industryType':
              example = '"餐饮美食"';
              break;
            case 'payType':
              example = '"微信支付"';
              break;
            case 'date':
              example = '"2024-12-09"';
              break;
            case 'month':
              example = '"2024-12"';
              break;
            case 'pageNum':
              example = '1';
              break;
            case 'pageSize':
              example = '20';
              break;
            default:
              example = paramSchema.example || '""';
          }

          toolInfo += `| ${paramName} | ${typeInfo} | ${isRequired} | ${formatEnum} | ${example} | ${paramSchema.description || ''} |\n`;
        }

        // 添加必需参数说明
        if (required.length > 0) {
          toolInfo += `\n**必需参数**: ${required.join(', ')}\n`;
        }
      }

      // 添加工具特定说明
      switch (tool.name) {
        case 'get_flows':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 日期格式必须为YYYY-MM-DD\n';
          toolInfo += '2. 如果不提供startDate，默认为当前月份第一天\n';
          toolInfo += '3. 如果不提供endDate，默认为当前日期\n';
          toolInfo += '4. pageSize最大值为100\n';
          break;
        case 'create_flow':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. money必须是正数\n';
          toolInfo += '2. 如果不提供date，使用当前日期\n';
          toolInfo += '3. industryType、payType、attribution都有默认值\n';
          toolInfo += '4. 金额单位是人民币（元）\n';
          break;
        case 'get_monthly_summary':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. month格式必须为YYYY-MM\n';
          toolInfo += '2. 如果不提供month，使用当前月份\n';
          break;
        case 'industryType_flow':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 根据用户输入在返回行业分类中选择\n';
          break;
        case 'get_belonger':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 此工具返回当前登录用户的归属人信息，包括姓名和邮箱\n';
          toolInfo += '2. 如果用户未登录，user字段将为null，isLoggedIn为false\n';
          toolInfo += '3. 在需要获取当前用户身份时使用此工具，例如：记录流水时确定归属人\n';
          toolInfo += '4. 返回信息可用于个性化回复或自动填充归属人字段\n';
          break;
        case 'get_duplicate_flows':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. criteria参数用于选择检查哪些字段的重复性，可以设置name、description、industryType、flowType、payType等字段\n';
          toolInfo += '2. 默认检查全部字段，需要显式设置为true才会检查\n';
          toolInfo += '3. 返回结果包含duplicateGroups（重复流水分组数组）、totalGroups（总组数）、totalDuplicates（总重复记录数）\n';
          toolInfo += '4. 每组重复流水包含相同字段值的多条记录，便于用户识别和清理重复数据\n';
          toolInfo += '5. 使用示例：{"criteria": {"name": true, "industryType": true}} 会同时检查名称和行业分类都相同的重复流水\n';
          break;
        case 'get_balance_candidates':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 该工具用于查找可以相互抵消的支出和收入流水，帮助用户进行平账处理\n';
          toolInfo += '2. 返回结果是一个candidates数组，每个元素包含out（支出流水对象）和in（收入流水对象）\n';
          toolInfo += '3. 平账候选的匹配逻辑基于金额相等或接近，且发生在相近时间内的支出和收入流水\n';
          toolInfo += '4. 系统会自动筛选出最有可能需要平账的流水对，减少手动查找的工作量\n';
          toolInfo += '5. 返回的候选对需要用户确认后才能执行实际的平账操作\n';
          break;
        case 'confirm_balance':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 平账操作的作用是将指定的支出流水和一条或多条收入流水进行抵消，标记为已平账状态\n';
          toolInfo += '2. 必需参数：outId（支出流水ID，数字类型）、inIds（收入流水ID数组，至少包含一个ID）\n';
          toolInfo += '3. 平账操作会影响账本的总余额计算，将抵消的金额从支出和收入中扣除\n';
          toolInfo += '4. 平账成功后，相关流水会被标记为已平账，在统计报表中不再单独计算\n';
          toolInfo += '5. 使用示例：{"outId": 123, "inIds": [456, 789]} 表示将ID为123的支出与ID为456和789的收入进行平账\n';
          break;
        case 'ignore_balance_item':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 忽略平账项的作用是将指定流水标记为不需要平账，从平账候选列表中移除\n';
          toolInfo += '2. 必需参数：id（流水ID，数字类型）\n';
          toolInfo += '3. 忽略操作后，该流水将不再出现在get_balance_candidates的返回结果中\n';
          toolInfo += '4. 适用于那些虽然是支出/收入对，但实际不需要进行平账处理的特殊情况\n';
          break;
        case 'delete_flow':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 这是一个高风险操作，删除后数据无法恢复，必须谨慎使用,主要用于get_duplicate_flows后删除重复记录\n';
          toolInfo += '2. 必需参数：id（流水记录ID，数字类型）\n';
          toolInfo += '3. 确认参数：confirm（必须设置为true才能执行删除操作，这是安全保护机制）\n';
          toolInfo += '4. 删除操作会影响账本的总余额和统计信息\n';
          toolInfo += '5. 建议在删除前确认要删除的流水信息\n';
          toolInfo += '6. 删除操作不可逆，请确保用户明确知道后果\n';
          break;
      }

      toolInfo += '\n---\n';
      return toolInfo;
    }).join('\n');

    // 构建上下文信息字符串
    let contextInfo = `当前时间: ${context.localTime}\n`;

    if (context.user) {
      contextInfo += `用户信息: ${context.user.name} (${context.user.email})\n`;
    } else {
      contextInfo += '用户信息: 未登录或用户信息不可用\n';
    }

    if (context.currentBook) {
      contextInfo += `当前账本: ${context.currentBook.bookName} (ID: ${context.currentBook.bookId})\n`;
      const createDate = new Date(context.currentBook.createDate);
      contextInfo += `账本创建时间: ${createDate.toLocaleDateString('zh-CN')}\n`;
    } else {
      contextInfo += '当前账本: 未选择账本\n';
    }

    if (context.server) {
      contextInfo += `服务器: ${context.server.name}\n`;
    }

    // 添加当前月份信息
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    contextInfo += `当前月份: ${currentMonth}\n`;

    return `你是一个专业的记账助手，操作修改数据前给用户进行简要说明，
    可以调用以下工具来帮助用户管理财务：

## 可用工具详细说明
${toolsDetailedDescription}

## 重要上下文信息
${contextInfo}

## 工具调用最佳实践
1. **账本ID**: 所有工具调用都会自动使用当前账本ID，你不需要在参数中指定bookId
2. **日期处理**: 
   - 如果用户没有明确指定日期，请使用当前日期或根据上下文推断
   - 日期参数名使用date（YYYY-MM-DD格式）
   - 月份参数名使用month（YYYY-MM格式）
   - 固定支出需要startDate和可能的endDate
3. **金额处理**: 
   - 金额单位是人民币（元）
   - 金额，不能小于0。
   - 预算金额必须是正数
4. **参数映射**: 当用户使用别名时，需要映射到正确的参数名：
   - amount → money
   - category → industryType
   - type → flowType
   - desc/description → description
   - time/date → date
   - note → description
   - budget → budget（预算）
   - payment → payType（支付方式）
   - owner → attribution（归属人）
5. **参数补全**: 当用户输入中缺少必要参数时，需要根据上下文进行推断
6. **安全操作**: 
   - 删除操作（delete_fixed_flow、delete_flow）需要confirm参数为true
   - 批量操作（ignore_all_balance_items）需要确认
   - 更新操作前建议先查看当前状态
7. **数据刷新**: 
   - 大量数据操作后，可调用refresh_budget_usage刷新预算使用情况
   - 获取列表数据（get_pay_types、get_attributions）可用于填充下拉选项

### 新工具最佳实践指南
#### 固定支出管理工具
**使用时机**:
- **add_fixed_flow**: 当用户需要添加周期性支出（如每月房租、订阅费）时使用
- **update_fixed_flow**: 当用户需要修改现有固定支出的金额、周期或其他属性时使用
- **delete_fixed_flow**: 当用户需要删除不再需要的固定支出时使用

**安全考虑**:
- 删除固定支出前，建议先查看相关记录，确认无误
- 更新固定支出不会影响已生成的流水记录
- 添加固定支出时，确保开始日期合理，避免创建过去的重复记录

**集成建议**:
- 在添加固定支出前，可先调用get_pay_types和get_attributions获取可用选项
- 固定支出与普通流水记录分开管理，但会影响未来的预算计算

#### 预算管理工具
**使用时机**:
- **update_budget**: 当用户需要设置或修改某个月份的预算时使用
- **refresh_budget_usage**: 当用户进行了大量流水操作后，需要刷新预算使用情况时使用

**参数推断规则**:
- 如果用户提到"本月预算"，month参数应为当前月份（YYYY-MM格式）
- 如果用户提到"下月预算"，month参数应为下个月份
- 预算金额应从用户输入中提取数字，如"预算5000元" → budget=5000

**集成建议**:
- 更新预算后，可自动调用refresh_budget_usage确保数据准确
- 预算工具与get_monthly_summary配合使用，提供完整的月度分析

#### 平账管理工具
**使用时机**:
- **ignore_all_balance_items**: 当用户确认所有当前平账候选都不需要处理时使用

**安全考虑**:
- 这是批量操作，必须要求用户明确确认（confirm=true）
- 操作前建议先调用get_balance_candidates查看候选列表
- 忽略操作可以撤销，但需要重新运行平账候选查找

**集成建议**:
- 与get_balance_candidates和confirm_balance工具配合使用
- 在用户清理完平账候选后使用，保持界面整洁

#### 数据查询工具
**使用时机**:
- **get_pay_types**: 当用户需要查看可用支付方式，或在创建/更新流水时需要填充支付方式选项时使用
- **get_attributions**: 当用户需要查看可用归属人，或在创建/更新流水时需要填充归属人选项时使用

**使用模式**:
- 这些工具通常不需要参数，直接调用即可
- 结果可用于向用户展示选项，或自动选择默认值
- 在表单填充场景中特别有用

**集成建议**:
- 在create_flow、update_flow、add_fixed_flow等工具调用前使用，确保参数值有效
- 结果可以缓存以提高性能，但需要定期刷新以确保数据最新

## 参数推断指导
### 针对create_flow工具：
**必需参数推断规则**:
1. **name推断**:
   - 从用户描述中提取关键信息，如"交通支出30元" → name="交通支出"
   - 如果用户提到具体类别，name可以是"类别+类型"，如"餐饮消费"
   - 默认值："日常记账" + 当前日期

2. **flowType推断**:
   - 关键词"收入"、"赚钱"、"收到" → "收入"
   - 关键词"支出"、"花费"、"支付" → "支出"
   - 关键词"转账"、"还款"、"不计收支" → "不计收支"

3. **industryType推断**:
   - 从输入中提取常见类别：餐饮、交通、购物、娱乐、医疗、教育、投资等
   - 默认值："其他"

4. **date推断**:
   - "今天"、"现在" → 当前日期
   - "昨天" → 前一天日期
   - "上周" → 7天前日期
   - "上月" → 上个月日期
   - 默认：当前日期

### 针对get_flows工具：
**日期范围推断**:
- "查看本月流水" → startDate=当月第一天，endDate=当前日期
- "查看上周流水" → startDate=7天前，endDate=当前日期
- "查看2024年流水" → startDate="2024-01-01"，endDate="2024-12-31"

### 针对固定支出工具：
**周期推断**:
- "每月5号" → cycleType="每月", cycleDay=5
- "每周一" → cycleType="每周"（系统会自动处理）
- "每年1月1号" → cycleType="每年", 需要具体日期处理
**开始日期推断**:
- "从下个月开始" → startDate=下个月第一天
- "立即开始" → startDate=当前日期
- "从今天开始" → startDate=当前日期
- "从2025年1月开始" → startDate="2025-01-01"
**结束日期推断**:
- "持续一年" → endDate=开始日期加一年
- "无限期" → 不提供endDate
- "到年底结束" → endDate=当前年份的12月31日
- "持续6个月" → endDate=开始日期加6个月
**金额推断**:
- "每月3000元房租" → money=3000
- "订阅费15元" → money=15
**其他参数推断**:
- 如果用户提到"房租"，industryType可推断为"住房物业"
- 如果用户提到"订阅"，industryType可推断为"数码娱乐"或"其他"
- payType和attribution可根据历史记录或默认值推断

### 针对预算工具：
**月份推断**:
- "本月预算" → month=当前月份（YYYY-MM格式）
- "下月预算" → month=下个月份
- "12月预算" → month="当前年份-12"
- "2025年3月预算" → month="2025-03"
**金额推断**:
- "预算5000" → budget=5000
- "设为3000元" → budget=3000
- "每月预算2000" → budget=2000

### 针对平账管理工具：
**参数推断**:
- ignore_all_balance_items: 当用户说"忽略所有"、"全部跳过"时使用，必须设置confirm=true
- 不需要其他参数推断

### 针对数据查询工具：
**参数推断**:
- get_pay_types和get_attributions不需要参数推断，直接调用即可
- 当用户询问"有哪些支付方式"、"归属人有哪些"时使用

### 针对工具集成推断：
**组合使用模式**:
1. **创建流水前获取选项**:
   - 用户说"记一笔支出" → 先调用get_pay_types和get_attributions获取可用选项
   - 再调用create_flow，使用获取的选项作为参数建议
2. **管理固定支出**:
   - 用户说"修改我的固定支出" → 可能需要先查询现有固定支出（通过其他接口）
   - 再调用update_fixed_flow进行修改
3. **预算管理流程**:
   - 用户设置预算后 → 可自动调用refresh_budget_usage确保数据准确
   - 结合get_monthly_summary提供完整分析

## 常见错误避免
1. **参数格式错误**:
   - 日期必须为YYYY-MM-DD格式
   - 月份必须为YYYY-MM格式
   - 金额必须是数字类型
   - cycleDay必须在1-31范围内（当cycleType为"每月"时）

2. **必需参数缺失**:
   - create_flow必须提供name、money、flowType
   - add_fixed_flow必须提供name、money、flowType、industryType、payType、attribution、startDate、cycleType
   - update_budget必须提供month和budget
   - delete_fixed_flow必须提供id和confirm=true

3. **枚举值错误**:
   - flowType只能是"收入"、"支出"、"不计收支"
   - cycleType只能是"每月"、"每周"、"每年"
   - get_analytics的type只能是"attribution"、"payType"、"industryType"、"daily"

4. **安全确认缺失**:
   - delete_fixed_flow必须设置confirm=true
   - ignore_all_balance_items必须设置confirm=true
   - 批量操作前应提醒用户确认

## 工具调用示例
<!-- 已更新最佳实践指南和参数推断指导，包含所有新工具 -->
### 示例1：创建流水记录
用户输入："记一笔午餐消费50元"
<json>
{
  "toolCalls": [
    {
      "name": "create_flow",
      "arguments": {
        "name": "午餐消费",
        "money": 50,
        "flowType": "支出",
        "industryType": "餐饮美食",
        "payType": "其他",
        "attribution": "默认",
        "date": "2024-12-09",
        "description": "用户记录：午餐消费50元"
      }
    }
  ]
}
</json>

### 示例2：查询本月流水
用户输入："查看本月支出"
<json>
{
  "toolCalls": [
    {
      "name": "get_flows",
      "arguments": {
        "startDate": "2024-12-01",
        "endDate": "2024-12-09",
        "flowType": "支出",
        "pageNum": 1,
        "pageSize": 20
      }
    }
  ]
}
</json>

### 示例3：获取月度统计
用户输入："查看12月统计"
<json>
{
  "toolCalls": [
    {
      "name": "get_monthly_summary",
      "arguments": {
        "month": "2024-12"
      }
    }
  ]
}
</json>

### 示例4：更新流水记录
用户输入："把ID为123的流水名称改为'晚餐消费'"
<json>
{
  "toolCalls": [
    {
      "name": "update_flow",
      "arguments": {
        "id": 123,
        "name": "晚餐消费"
      }
    }
  ]
}
</json>

### 示例5：查找重复流水记录
用户输入："查找重复的流水记录"
<json>
{
  "toolCalls": [
    {
      "name": "get_duplicate_flows",
      "arguments": {
        "criteria": {
          "name": true,
          "description": false,
          "industryType": false,
          "flowType": false,
          "payType": false
        }
      }
    }
  ]
}
</json>

### 示例6：查看平账候选
用户输入："查看可以平账的流水"
<json>
{
  "toolCalls": [
    {
      "name": "get_balance_candidates",
      "arguments": {}
    }
  ]
}
</json>

### 示例7：确认平账操作
用户输入："将ID为123的支出与ID为456的收入进行平账"
<json>
{
  "toolCalls": [
    {
      "name": "confirm_balance",
      "arguments": {
        "outId": 123,
        "inIds": [456]
      }
    }
  ]
}
</json>

### 示例8：忽略平账项
用户输入："忽略ID为789的平账项"
<json>
{
  "toolCalls": [
    {
      "name": "ignore_balance_item",
      "arguments": {
        "id": 789
      }
    }
  ]
}
</json>

### 示例9：删除流水记录
用户输入："删除ID为123的流水记录"
<json>
{
  "toolCalls": [
    {
      "name": "delete_flow",
      "arguments": {
        "id": 123,
        "confirm": true
      }
    }
  ]
}
</json>

### 示例10：添加固定支出
用户输入："添加每月5号3000元的房租支出"
<json>
{
  "toolCalls": [
    {
      "name": "add_fixed_flow",
      "arguments": {
        "name": "每月房租",
        "money": 3000,
        "flowType": "支出",
        "industryType": "住房物业",
        "payType": "银行转账",
        "attribution": "默认",
        "description": "每月5号交房租",
        "startDate": "2024-12-01",
        "cycleType": "每月",
        "cycleDay": 5
      }
    }
  ]
}
</json>

### 示例11：更新固定支出
用户输入："把ID为123的固定支出金额改为3500元"
<json>
{
  "toolCalls": [
    {
      "name": "update_fixed_flow",
      "arguments": {
        "id": 123,
        "money": 3500
      }
    }
  ]
}
</json>

### 示例12：删除固定支出
用户输入："删除ID为456的固定支出"
<json>
{
  "toolCalls": [
    {
      "name": "delete_fixed_flow",
      "arguments": {
        "id": 456,
        "confirm": true
      }
    }
  ]
}
</json>

### 示例13：更新月度预算
用户输入："把12月预算设为5000元"
<json>
{
  "toolCalls": [
    {
      "name": "update_budget",
      "arguments": {
        "month": "2024-12",
        "budget": 5000
      }
    }
  ]
}
</json>

### 示例14：刷新预算使用
用户输入："刷新12月预算使用情况"
<json>
{
  "toolCalls": [
    {
      "name": "refresh_budget_usage",
      "arguments": {
        "month": "2024-12"
      }
    }
  ]
}
</json>

### 示例15：忽略所有平账候选
用户输入："忽略所有平账候选"
<json>
{
  "toolCalls": [
    {
      "name": "ignore_all_balance_items",
      "arguments": {
        "confirm": true
      }
    }
  ]
}
</json>

### 示例16：获取支付方式列表
用户输入："查看可用的支付方式"
<json>
{
  "toolCalls": [
    {
      "name": "get_pay_types",
      "arguments": {}
    }
  ]
}
</json>

### 示例17：获取归属人列表
用户输入："查看可用的归属人"
<json>
{
  "toolCalls": [
    {
      "name": "get_attributions",
      "arguments": {}
    }
  ]
}
</json>

### 示例18：添加固定支出
用户输入："添加每月5号3000元的房租支出，从2024-12-01开始"
<json>
{
  "toolCalls": [
    {
      "name": "add_fixed_flow",
      "arguments": {
        "name": "每月房租",
        "money": 3000,
        "flowType": "支出",
        "industryType": "住房物业",
        "payType": "银行转账",
        "attribution": "默认",
        "description": "每月5号交房租",
        "startDate": "2024-12-01",
        "cycleType": "每月",
        "cycleDay": 5
      }
    }
  ]
}
</json>
<!-- 说明：添加固定支出需要提供完整的参数，包括名称、金额、类型、行业分类、支付方式、归属人、描述、开始日期、周期类型和周期日。 -->

### 示例19：更新固定支出
用户输入："把ID为123的订阅费从15元改为20元"
<json>
{
  "toolCalls": [
    {
      "name": "update_fixed_flow",
      "arguments": {
        "id": 123,
        "money": 20,
        "description": "更新后的订阅费用"
      }
    }
  ]
}
</json>
<!-- 说明：更新固定支出只需要提供ID和需要更新的字段，可以部分更新。 -->

### 示例20：删除固定支出
用户输入："删除ID为456的固定支出"
<json>
{
  "toolCalls": [
    {
      "name": "delete_fixed_flow",
      "arguments": {
        "id": 456,
        "confirm": true
      }
    }
  ]
}
</json>
<!-- 说明：删除固定支出需要提供ID和confirm参数为true，这是安全保护机制。 -->

### 示例21：更新月度预算
用户输入："把12月预算设为5000元"
<json>
{
  "toolCalls": [
    {
      "name": "update_budget",
      "arguments": {
        "month": "2024-12",
        "budget": 5000
      }
    }
  ]
}
</json>
<!-- 说明：更新预算需要提供月份（YYYY-MM格式）和预算金额。 -->

### 示例22：刷新预算使用情况
用户输入："刷新12月预算使用情况"
<json>
{
  "toolCalls": [
    {
      "name": "refresh_budget_usage",
      "arguments": {
        "month": "2024-12"
      }
    }
  ]
}
</json>
<!-- 说明：刷新预算使用情况只需要提供月份，系统会重新计算该月的支出总额。 -->

### 示例23：忽略所有平账候选
用户输入："忽略所有平账候选"
<json>
{
  "toolCalls": [
    {
      "name": "ignore_all_balance_items",
      "arguments": {
        "confirm": true
      }
    }
  ]
}
</json>
<!-- 说明：忽略所有平账候选需要confirm参数为true，这是批量操作的安全确认。 -->

### 示例24：获取支付方式列表（用于表单填充）
用户输入："查看可用的支付方式"
<json>
{
  "toolCalls": [
    {
      "name": "get_pay_types",
      "arguments": {}
    }
  ]
}
</json>
<!-- 说明：获取支付方式列表不需要参数，返回当前账本可用的支付方式。 -->

### 示例25：获取归属人列表（用于表单填充）
用户输入："查看可用的归属人"
<json>
{
  "toolCalls": [
    {
      "name": "get_attributions",
      "arguments": {}
    }
  ]
}
</json>
<!-- 说明：获取归属人列表不需要参数，返回当前账本可用的归属人。 -->

## 回复要求
1. 尽量用简洁、友好的中文回复用户
2. 如果用户询问统计信息，优先使用分析工具
3. 工具调用成功后，简要总结执行结果
4. 如果工具调用失败，向用户解释可能的原因并提供解决方案

当需要调用工具时，请严格按照上述格式返回JSON工具调用指令。
你可以同时调用多个工具，系统会按顺序执行。

请根据用户的需求和当前上下文，选择最合适的工具来帮助他们，并确保所有必要参数都被正确补全。`;
  }

  private getDefaultEndpoint(provider: string): string {
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages', // Anthropic原生端点，需要OpenAI兼容
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', // 需要OpenAI兼容
      custom: '', // custom provider 使用用户提供的 baseURL
    };

    // 对于需要OpenAI兼容的供应商，我们可以使用兼容端点
    // 注意：实际使用时可能需要配置代理或兼容服务
    return endpoints[provider] || endpoints.openai;
  }

  private getDefaultModel(provider: string): string {
    const models: Record<string, string> = {
      openai: 'gpt-3.5-turbo',
      anthropic: 'claude-3-haiku-20240307',
      deepseek: 'deepseek-chat',
      google: 'gemini-pro',
      custom: 'gpt-3.5-turbo', // 为 custom provider 提供合理的默认值
    };
    return models[provider] || models.openai;
  }

  private buildHeaders(config: any): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 统一使用Bearer token认证方式
    // 注意：对于某些供应商，可能需要特殊处理，但这里统一为OpenAI兼容格式
    if (config.provider === 'anthropic') {
      // Anthropic的OpenAI兼容端点可能需要不同的认证方式
      // 这里假设使用x-api-key，但实际可能需要调整
      headers['x-api-key'] = config.apiKey;
      // 添加Anthropic版本头
      headers['anthropic-version'] = '2023-06-01';
    } else if (config.provider === 'google') {
      // Google的OpenAI兼容端点可能需要特殊处理
      // 这里暂时使用Bearer token，实际可能需要调整
      headers.Authorization = `Bearer ${config.apiKey}`;
    } else {
      // OpenAI兼容格式（包括DeepSeek、OpenAI、custom等）
      // custom provider 也使用 Bearer token
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    return headers;
  }

  private buildRequestBody(config: any, messages: any[], stream: boolean = true): any {
    // 统一使用OpenAI兼容格式
    // 注意：对于Anthropic和Google，需要确保端点支持OpenAI格式
    const requestBody: any = {
      model: config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: config.maxTokens || 1000,
      temperature: config.temperature || 0.7,
      stream: stream, // 使用传入的stream参数，但默认值为true
    };

    // 优化建议生成API调用，考虑使用更小的模型或缓存结果以提高性能
    // 对于生成建议的场景，可以使用更低的temperature和更少的max_tokens
    if (!stream && messages.some(msg => msg.content.includes('提示建议生成器'))) {
      requestBody.max_tokens = 200; // 建议生成不需要太多tokens
      requestBody.temperature = 0.3; // 更低的随机性以获得更一致的输出
    }

    // 对于特定供应商，可能需要调整参数
    if (config.provider === 'anthropic') {
      // Anthropic的OpenAI兼容端点可能需要特定参数
      // 保持与OpenAI格式一致
    } else if (config.provider === 'google') {
      // Google的OpenAI兼容端点可能需要特定参数
      // 保持与OpenAI格式一致
    }
    // 其他供应商（openai, deepseek, custom）都使用相同的格式

    return requestBody;
  }

  private adjustEndpoint(baseURL: string, provider: string): string {
    console.log('🔧 开始调整端点', {
      original: baseURL,
      provider: provider,
    });

    // 如果没有baseURL，返回默认端点
    if (!baseURL || baseURL.trim() === '') {
      const defaultEndpoint = this.getDefaultEndpoint(provider);
      console.log('⚠️ 使用默认端点', { defaultEndpoint });
      return defaultEndpoint;
    }

    // 清理URL：去除末尾的斜杠
    let cleanedURL = baseURL.trim();
    if (cleanedURL.endsWith('/')) {
      cleanedURL = cleanedURL.slice(0, -1);
    }

    // 检查是否需要添加路径
    // 情况1：URL已经包含/chat/completions
    if (cleanedURL.includes('/chat/completions')) {
      console.log('✅ 端点已包含/chat/completions路径', { final: cleanedURL });
      return cleanedURL;
    }

    // 情况2：URL以/v1结尾
    if (cleanedURL.endsWith('/v1')) {
      const finalURL = `${cleanedURL}/chat/completions`;
      console.log('🔧 端点以/v1结尾，添加/chat/completions', {
        original: baseURL,
        adjusted: finalURL,
      });
      return finalURL;
    }

    // 情况3：URL包含/v1/但不是以它结尾
    if (cleanedURL.includes('/v1/')) {
      // 如果已经有其他路径，直接返回
      console.log('✅ 端点已包含/v1/路径', { final: cleanedURL });
      return cleanedURL;
    }

    // 情况4：URL没有路径或路径不完整
    // 检查是否有路径部分
    try {
      const urlObj = new URL(cleanedURL);
      const pathname = urlObj.pathname;

      // 如果路径为空或只有斜杠
      if (!pathname || pathname === '/' || pathname === '') {
        const finalURL = `${cleanedURL}/v1/chat/completions`;
        console.log('🔧 端点没有路径，添加/v1/chat/completions', {
          original: baseURL,
          adjusted: finalURL,
        });
        return finalURL;
      }

      // 如果有路径但不是/v1相关
      // 对于 custom provider，我们总是添加 /v1/chat/completions 以确保兼容性
      if (provider === 'custom') {
        const finalURL = `${cleanedURL}/v1/chat/completions`;
        console.log('🔧 custom provider：添加/v1/chat/completions以确保兼容性', {
          original: baseURL,
          adjusted: finalURL,
        });
        return finalURL;
      }

      // 对于其他提供商，保持原样
      console.log('⚠️ 端点有自定义路径，保持原样', {
        original: baseURL,
        pathname: pathname,
        final: cleanedURL,
      });
      return cleanedURL;
    } catch (error) {
      // 如果不是有效的URL，可能是格式错误
      console.error('❌ 端点URL格式无效', {
        original: baseURL,
        error: error instanceof Error ? error.message : String(error),
      });

      // 尝试修复：如果看起来像域名但没有协议，添加https://
      if (!cleanedURL.startsWith('http://') && !cleanedURL.startsWith('https://')) {
        const fixedURL = `https://${cleanedURL}/v1/chat/completions`;
        console.log('🔧 添加https://协议和/v1/chat/completions路径', {
          original: baseURL,
          fixed: fixedURL,
        });
        return fixedURL;
      }

      // 如果已经是http/https开头但解析失败，可能是格式问题
      // 直接添加/v1/chat/completions并返回
      const finalURL = `${cleanedURL}/v1/chat/completions`;
      console.log('🔧 端点解析失败，尝试添加/v1/chat/completions', {
        original: baseURL,
        adjusted: finalURL,
      });
      return finalURL;
    }
  }

  // 注意：所有API调用现在只支持流式模式，非流式调用已被移除
  async callAIAPI(config: any, systemPrompt: string, userMessage: string, streamCallback: (content: string, reasoning_content: string, isComplete: boolean) => void): Promise<void> {
    // 只支持流式调用，streamCallback 必须提供
    if (!streamCallback) {
      throw new Error('流式回调函数必须提供，接口调用只支持流式模式');
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.getRecentHistory(),
      { role: 'user', content: userMessage },
    ];

    // 获取端点和模型
    const defaultEndpoint = this.getDefaultEndpoint(config.provider);
    const defaultModel = this.getDefaultModel(config.provider);

    // 使用调整后的端点
    let apiEndpoint;
    if (config.baseURL) {
      apiEndpoint = this.adjustEndpoint(config.baseURL, config.provider);
    } else {
      apiEndpoint = defaultEndpoint;
    }

    const model = config.model || defaultModel;

    console.log('🚀 准备AI API调用（仅流式）', {
      provider: config.provider,
      endpoint: apiEndpoint,
      model: model,
      messageCount: messages.length,
      hasCustomEndpoint: !!config.baseURL,
    });

    // 构建请求头和请求体
    const headers = this.buildHeaders(config);
    const requestBody = this.buildRequestBody(config, messages, true); // 总是使用流式

    console.log('📦 请求体信息', {
      provider: config.provider,
      model: requestBody.model,
      messageCount: requestBody.messages?.length || 0,
      maxTokens: requestBody.max_tokens,
      temperature: requestBody.temperature,
      stream: requestBody.stream,
    });

    // 只使用流式调用
    await this.processStreamResponse(apiEndpoint, headers, requestBody, streamCallback);
  }

  private async processStreamResponse(
    endpoint: string,
    headers: Record<string, string>,
    body: any,
    streamCallback: (content: string, reasoning_content: string, isComplete: boolean) => void
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🌊 开始处理流式响应（使用react-native-sse）', {
          endpoint: endpoint,
          headers: headers,
          bodySize: JSON.stringify(body).length,
          provider: body.model?.includes('deepseek') ? 'DeepSeek' : 'Other',
          timestamp: new Date().toISOString(),
        });

        console.log('📡 发送SSE请求', {
          method: 'POST',
          url: endpoint,
          headersCount: Object.keys(headers).length,
          hasAuthorization: !!headers.Authorization,
          contentType: headers['Content-Type'],
        });

        // 创建EventSource实例
        const es = new EventSource(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
          pollingInterval: 0, // 禁用轮询，使用真正的SSE
        });

        let hasError = false;

        // 监听消息事件
        es.addEventListener('message', (event) => {
          try {
            if (event.type === 'message') {
              const data = event.data;

              console.log('📝 收到SSE数据', {
                data,
              });
              // 跳过结束标记
              if (data === '[DONE]') {
                console.log('🏁 收到SSE结束标记');
                es.close();
                es.removeAllEventListeners();
                return;
              }

              if (!data) {
                return;
              }

              // 解析JSON数据
              const parsedData = JSON.parse(data);

              // 提取内容：检查多个可能的字段
              let delta = '';
              let thinkingDelta = '';

              // 1. 首先检查 reasoning_content（思考内容）
              if (parsedData.choices?.[0]?.delta?.reasoning_content !== undefined) {
                thinkingDelta = parsedData.choices[0].delta.reasoning_content || '';
              }
              // 2. 检查其他可能的思考字段
              else if (parsedData.reasoning_content !== undefined) {
                thinkingDelta = parsedData.reasoning_content || '';
              }
              else if (parsedData.choices?.[0]?.delta?.thinking !== undefined) {
                thinkingDelta = parsedData.choices[0].delta.thinking || '';
              }

              // 3. 提取常规内容
              if (parsedData.choices?.[0]?.delta?.content !== undefined) {
                delta = parsedData.choices[0].delta.content || '';
              } else if (parsedData.content !== undefined) {
                delta = parsedData.content || '';
              } else if (parsedData.result?.choices?.[0]?.delta?.content !== undefined) {
                delta = parsedData.result.choices[0].delta.content || '';
              } else if (parsedData.text !== undefined) {
                delta = parsedData.text || '';
              } else if (parsedData.message?.content !== undefined) {
                delta = parsedData.message.content || '';
              }

              // 发送到流式回调
              if (delta || thinkingDelta) {
                streamCallback(delta,thinkingDelta, false);
              }
            }
          } catch (parseError) {
            console.warn('❌ 解析SSE数据失败', {
              error: parseError instanceof Error ? parseError.message : String(parseError),
              eventData: event.data?.substring(0, 200),
            });
          }
        });

        // 监听错误事件
        es.addEventListener('error', (event) => {
          console.error('❌ SSE连接错误', {
            eventType: event.type,
            event: JSON.stringify(event),
          });

          if (!hasError) {
            hasError = true;
            es.close();
            reject(new Error('SSE连接错误'));
          }
        });

        // 监听打开事件
        es.addEventListener('open', (event) => {
          console.log('✅ SSE连接已建立', {
            eventType: event.type,
          });
        });

        // 监听关闭事件
        es.addEventListener('close', (event) => {
          console.log('🔒 SSE连接已关闭', {
            eventType: event.type,
          });

          if (!hasError) {
            // 正常关闭，完成流式处理
            streamCallback('', '', true);

            // 返回空字符串，因为内容已经通过回调处理
            resolve('');
          }
        });

        // 清理函数
        const cleanup = () => {
          es.close();
          es.removeAllEventListeners();
        };

        // 确保在Promise解决或拒绝时清理资源
        Promise.race([
          new Promise((_) => {
            // 错误处理已在error事件中完成
          }),
        ]).finally(cleanup);

      } catch (error) {
        console.error('❌ 流式响应处理失败', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          endpoint: endpoint,
          timestamp: new Date().toISOString(),
        });
        reject(error);
      }
    });
  }

  addToHistory(role: 'user' | 'assistant' | 'system', content: string) {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }
  }

  private getRecentHistory() {
    return this.conversationHistory
      .slice(-10)
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
  }

  clearHistory() {
    console.log('🗑️ 清除对话历史');
    this.conversationHistory = [];
  }

  getHistory() {
    return [...this.conversationHistory];
  }

  // 检查是否可以生成AI建议
  canGenerateSuggestions(): boolean {
    // 这里需要检查AI配置是否已设置
    // 在实际实现中，应该检查配置是否存在且有效
    // 目前返回true，让调用者决定是否使用
    return true;
  }

  // 生成AI驱动的提示建议
  async generatePromptSuggestions(userInput: string, count: number = 3): Promise<string[]> {
    try {
      // 动态导入AIConfigService以避免循环依赖
      let aiConfigModule;
      try {
        aiConfigModule = await import('./AIConfigService');
      } catch (importError) {
        console.error('导入AIConfigService失败:', importError);
        return this.getFallbackSuggestions(userInput, count);
      }

      // 检查AI配置
      const isConfigured = await aiConfigModule.aiConfigService.isConfigured();

      if (!isConfigured) {
        console.log('AI未配置，无法生成建议');
        return this.getFallbackSuggestions(userInput, count);
      }

      // 设置超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('生成建议超时')), 10000); // 10秒超时
      });

      // 获取配置
      const config = await aiConfigModule.aiConfigService.getConfig();
      if (!config) {
        return this.getFallbackSuggestions(userInput, count);
      }

      // 构建系统提示
      const systemPrompt = `你是一个个人记账助手的提示建议生成器。
      你的任务是根据用户的部分输入，生成${count}个相关的、简洁的完整提示建议。
      
      要求：
      1. 每个建议应该是一个完整的、可执行的句子
      2. 建议应该基于用户的输入进行扩展
      3. 建议应该与记账应用相关，包括：记录交易、查询数据、分析趋势、预算管理等
      4. 每个建议不超过20个字
      5. 用中文回复
      6. 返回纯文本，每行一个建议，不要编号
      
      用户输入：${userInput}
      
      请生成${count}个建议：`;

      // 构建消息
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: `根据我的输入"${userInput}"，生成${count}个相关的记账提示建议。` }
      ];

      // 构建请求头
      const headers = this.buildHeadersForSuggestions(config);

      // 构建请求体
      const requestBody = this.buildRequestBodyForSuggestions(config, messages);

      // 获取端点
      let apiEndpoint;
      if (config.baseURL) {
        apiEndpoint = this.adjustEndpointForSuggestions(config.baseURL, config.provider);
      } else {
        apiEndpoint = this.getDefaultEndpointForSuggestions(config.provider);
      }

      // 发送请求
      const fetchPromise = fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();

      // 解析响应
      let suggestionsText = '';
      if (data.choices?.[0]?.message?.content) {
        suggestionsText = data.choices[0].message.content;
      } else if (data.content) {
        suggestionsText = data.content;
      } else if (data.result?.choices?.[0]?.message?.content) {
        suggestionsText = data.result.choices[0].message.content;
      } else if (data.message?.content) {
        suggestionsText = data.message.content;
      } else {
        throw new Error('无法解析API响应');
      }

      // 处理建议文本
      const suggestions = this.parseSuggestions(suggestionsText, count);
      return suggestions.length > 0 ? suggestions : this.getFallbackSuggestions(userInput, count);

    } catch (error) {
      console.error('生成AI建议失败:', error);
      return this.getFallbackSuggestions(userInput, count);
    }
  }

  // 为建议生成构建请求头
  private buildHeadersForSuggestions(config: any): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 根据提供商设置认证头
    if (config.provider === 'anthropic') {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (config.provider === 'google') {
      // Google可能使用API密钥作为查询参数，但这里仍然设置Authorization头
      headers.Authorization = `Bearer ${config.apiKey}`;
    } else {
      // OpenAI兼容格式（包括DeepSeek、OpenAI、custom等）
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    return headers;
  }

  // 为建议生成构建请求体
  private buildRequestBodyForSuggestions(config: any, messages: any[]): any {
    const requestBody: any = {
      model: config.model || this.getDefaultModelForSuggestions(config.provider),
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: 200, // 建议生成不需要太多tokens
      temperature: 0.3, // 更低的随机性以获得更一致的输出
      stream: false, // 非流式
    };

    // 对于特定供应商，可能需要调整参数
    if (config.provider === 'anthropic') {
      // Anthropic可能需要特定参数
      requestBody.max_tokens = 200;
    } else if (config.provider === 'google') {
      // Google可能需要特定参数
      requestBody.max_tokens = 200;
    }

    return requestBody;
  }

  // 获取建议生成的默认端点
  private getDefaultEndpointForSuggestions(provider: string): string {
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      custom: 'https://api.openai.com/v1/chat/completions', // 为custom提供默认值
    };
    return endpoints[provider] || endpoints.openai;
  }

  // 获取建议生成的默认模型
  private getDefaultModelForSuggestions(provider: string): string {
    const models: Record<string, string> = {
      openai: 'gpt-3.5-turbo',
      anthropic: 'claude-3-haiku-20240307',
      deepseek: 'deepseek-chat',
      google: 'gemini-pro',
      custom: 'gpt-3.5-turbo',
    };
    return models[provider] || models.openai;
  }

  // 为建议生成调整端点
  private adjustEndpointForSuggestions(baseURL: string, provider: string): string {
    if (!baseURL || baseURL.trim() === '') {
      return this.getDefaultEndpointForSuggestions(provider);
    }

    // 清理URL：去除末尾的斜杠
    let cleanedURL = baseURL.trim();
    if (cleanedURL.endsWith('/')) {
      cleanedURL = cleanedURL.slice(0, -1);
    }

    // 检查是否需要添加路径
    if (cleanedURL.includes('/chat/completions') || cleanedURL.includes('/messages')) {
      return cleanedURL;
    }

    // 对于不同的提供商，添加不同的路径
    if (provider === 'anthropic') {
      // Anthropic使用/messages端点
      if (cleanedURL.endsWith('/v1')) {
        return `${cleanedURL}/messages`;
      }
      return `${cleanedURL}/v1/messages`;
    } else {
      // 其他提供商使用/chat/completions端点
      if (cleanedURL.endsWith('/v1')) {
        return `${cleanedURL}/chat/completions`;
      }
      return `${cleanedURL}/v1/chat/completions`;
    }
  }

  // 解析建议文本
  private parseSuggestions(text: string, expectedCount: number): string[] {
    if (!text) return [];

    // 按行分割，过滤空行
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // 移除编号（如1.、2.等）
    const cleanedLines = lines.map(line => {
      // 移除开头的数字和标点
      return line.replace(/^[\d一二三四五六七八九十]+[\.、)\]\s]*\s*/, '');
    });

    // 限制数量
    return cleanedLines.slice(0, expectedCount);
  }

  // 获取备用建议（当AI不可用时）
  private getFallbackSuggestions(userInput: string, count: number): string[] {
    const defaultSuggestions = [
      '记一笔餐饮支出50元',
      '查看本月消费统计',
      '分析餐饮类别的花费',
      '设置本月预算3000元',
      '查看最近的流水记录',
      '统计年度收入总额',
      '查找重复的流水记录',
      '查看可以平账的流水',
    ];

    // 如果用户输入包含关键词，尝试匹配相关建议
    const input = userInput.toLowerCase();
    const filteredSuggestions = defaultSuggestions.filter(suggestion => {
      if (input.includes('记') || input.includes('支出') || input.includes('收入')) {
        return suggestion.includes('记一笔');
      }
      if (input.includes('查看') || input.includes('统计')) {
        return suggestion.includes('查看') || suggestion.includes('统计');
      }
      if (input.includes('分析')) {
        return suggestion.includes('分析');
      }
      if (input.includes('预算')) {
        return suggestion.includes('预算');
      }
      if (input.includes('重复')) {
        return suggestion.includes('重复');
      }
      if (input.includes('平账')) {
        return suggestion.includes('平账');
      }
      return true;
    });

    // 返回指定数量的建议
    return filteredSuggestions.slice(0, count);
  }
}

export const aiService = new AIService();
