import * as ImagePicker from 'react-native-image-picker';
import { Alert } from 'react-native';
import {Flow} from '../types';

export interface OCRResult {
  flow: Flow | null;
}

class OCRService {
  private static instance: OCRService;

  // 使用react-native-vision-camera-ocr-plus进行真实的OCR识别
  async recognizeTextFromImage(imageUri: string): Promise<OCRResult> {
    try {
      console.log('开始OCR识别:', imageUri);

      return {flow : null};
    } catch (error) {
      console.error('OCR识别失败:', error);
      // 添加更多错误信息以便调试
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      throw new Error('OCR识别失败，请重试');
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

      // 识别文本，传递orientation参数
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
      Alert.alert('错误', '拍照识别失败，请重试');
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

      // 识别文本，传递orientation参数
      return await this.recognizeTextFromImage(imageUri);

    } catch (error) {
      console.error('图片识别失败:', error);
      Alert.alert('错误', '图片识别失败，请重试');
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
