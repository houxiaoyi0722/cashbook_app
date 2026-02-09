import * as ImagePicker from 'react-native-image-picker';
import { Alert } from 'react-native';
import { OcrFlow} from '../types';
import { aiConfigService } from './AIConfigService';
import {aiService, AIService} from './AIService';

export interface OCRResult {
  flow: OcrFlow | null | undefined;
}

class OCRService {
  private static instance: OCRService;
  private aiService: AIService;

  constructor() {
    this.aiService = new AIService();
  }

  // 使用AI接口进行OCR识别
  async recognizeTextFromImage(imageUri: string): Promise<OCRResult> {
    try {
      console.log('开始OCR识别:', imageUri);

      // 检查OCR是否启用
      const isOCREnabled = await aiConfigService.isOCREnabled();
      if (!isOCREnabled) {
        throw new Error('OCR功能未启用，请在AI设置中启用OCR功能');
      }

      // 获取OCR模型配置
      const ocrConfig = await aiConfigService.getOCRModelConfig();
      if (!ocrConfig) {
        throw new Error('未配置OCR模型，请在AI设置中选择OCR模型配置');
      }

      // 检查API Key
      if (!ocrConfig.apiKey || ocrConfig.apiKey.trim() === '') {
        throw new Error('OCR模型配置的API Key为空，请检查配置');
      }

      const ocrPrompt = `请根据用户提供的图片描述，推断流水信息并返回JSON格式的Flow对象。

分析要求：
1. 根据描述推断以下流水信息：
   - 名称（name）：交易项目或商品名称
   - 金额（money）：交易金额（数字）
   - 行业类型（industryType）：如餐饮美食、交通出行、购物消费等
   - 支付方式（payType）：如现金、微信支付、支付宝、银行卡等
   - 描述（description）：填入全部识别文本

请根据常见的小票格式推断信息，尽可能填写所有字段。

重要：只返回JSON格式的Flow对象，不要有任何其他文本、解释或markdown格式。

Flow对象格式示例：
{
  "name": "午餐",
  "money": 68.5,
  "industryType": "餐饮美食",
  "payType": "支付宝",
  "description": "\${全部识别文本}"
}

现在请根据描述推断并返回JSON：`;

      // 准备AI配置
      const aiConfig = {
        provider: ocrConfig.provider,
        apiKey: ocrConfig.apiKey,
        model: ocrConfig.model,
        baseURL: ocrConfig.baseURL,
        maxTokens: ocrConfig.maxTokens || 1000,
        temperature: ocrConfig.temperature || 0.1, // 使用较低的温度以获得更确定性的输出
      };

      // 由于AIService的callAIAPI方法期望userMessage是一个字符串
      // 使用流式回调收集AI响应
      let aiResponseText = await this.aiService.callAIForTextGeneration(
        ocrPrompt, // 直接使用提示词作为用户消息
        aiConfig,
        ['你是一个专业的OCR识别助手，专门从图片描述中分析流水信息并转换为结构化数据。'],
        30000
      );

      console.log('AI响应文本:', aiResponseText);

      // 清理响应文本，提取JSON部分
      let jsonText = aiResponseText.trim();

      // 尝试从响应中提取JSON（可能包含其他文本）
      const jsonMatch = jsonText.match(/\{[\s\S]*}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      // 解析JSON响应
      let flowData: any;
      try {
        flowData = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('JSON解析失败:', parseError, '原始文本:', jsonText);
        // 如果解析失败，返回一个示例Flow对象
        Alert.alert('小票解析错误', `${parseError}`);
        throw parseError;
      }

      // 验证必需字段
      if (!flowData.name || !flowData.money) {
        console.warn('AI返回的数据缺少必需字段:', flowData);
        // 尝试使用默认值填充缺失字段
        flowData.name = flowData.name || '未识别名称';
        flowData.money = flowData.money || 0;
      }

      // 验证flowType值
      flowData.flowType = '支出'; // 默认值
      const context = await aiService.getContext();
      // 构建Flow对象
      const flow: OcrFlow = {
        bookId: context.bookId, // 需要在调用处设置
        name: flowData.name.toString(),
        money: typeof flowData.money === 'string' ? parseFloat(flowData.money) : Number(flowData.money),
        flowType: flowData.flowType,
        industryType: flowData.industryType || '其他',
        payType: flowData.payType || '其他',
        description: flowData.description || '',
        attribution: context.user.name || undefined,
        day: new Date().toISOString().split('T')[0], // 默认使用当天日期
        invoice: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      console.log('OCR识别成功:', flow);
      return { flow };

    } catch (error) {
      console.error('OCR识别失败:', error);
      // 添加更多错误信息以便调试
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      Alert.alert('小票识别错误', `${error}`);
      throw error;
    }
  }

  // 拍照并识别
  async takePhotoAndRecognize(): Promise<OCRResult | null> {
    try {
      // 打开相机
      const result = await ImagePicker.launchCamera({
        mediaType: 'photo',
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        includeBase64: false,
        saveToPhotos: false,
      });

      if (result.didCancel) {
        console.log('用户取消了拍照');
        return null;
      }

      if (result.errorCode) {
        Alert.alert('拍照错误', result.errorMessage || '拍照失败');
        return null;
      }

      if (!result.assets || result.assets.length === 0) {
        Alert.alert('错误', '未获取到图片');
        return null;
      }

      const imageUri = result.assets[0].uri;
      if (!imageUri) {
        Alert.alert('错误', '图片URI无效');
        return null;
      }

      // 识别文本
      return await this.recognizeTextFromImage(imageUri);

    } catch (error) {
      console.error('拍照识别失败:', error);
      // 检查错误类型，如果是用户取消，不显示错误提示
      // ImagePicker 通常通过 didCancel 处理取消，但这里添加额外的检查
      if (error instanceof Error && (
        error.message.includes('USER_CANCELED') ||
        error.message.includes('canceled') ||
        error.message.includes('cancelled')
      )) {
        console.log('用户取消了操作');
        return null;
      }

      // 显示具体的错误信息
      const errorMessage = error instanceof Error ? error.message : '拍照识别失败，请重试';
      Alert.alert('OCR识别错误', errorMessage);
      return null;
    }
  }

  // 从相册选择并识别
  async pickImageAndRecognize(): Promise<OCRResult | null> {
    try {
      // 打开相册
      const result = await ImagePicker.launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        includeBase64: false,
        selectionLimit: 1,
      });

      if (result.didCancel) {
        console.log('用户取消了选择');
        return null;
      }

      if (result.errorCode) {
        Alert.alert('选择错误', result.errorMessage || '选择图片失败');
        return null;
      }

      if (!result.assets || result.assets.length === 0) {
        Alert.alert('错误', '未选择图片');
        return null;
      }

      const imageUri = result.assets[0].uri;
      if (!imageUri) {
        Alert.alert('错误', '图片URI无效');
        return null;
      }

      // 识别文本
      return await this.recognizeTextFromImage(imageUri);

    } catch (error) {
      console.error('图片识别失败:', error);
      // 显示具体的错误信息
      const errorMessage = error instanceof Error ? error.message : '图片识别失败，请重试';
      Alert.alert('OCR识别错误', errorMessage);
      return null;
    }
  }

  // 获取单例实例
  static getInstance(): OCRService {
    if (!OCRService.instance) {
      OCRService.instance = new OCRService();
    }
    return OCRService.instance;
  }
}

export default OCRService;
