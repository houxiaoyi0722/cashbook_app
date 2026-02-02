import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet, Platform, KeyboardAvoidingView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@rneui/themed';
import DropDownPicker from 'react-native-dropdown-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { aiConfigService, AIConfig } from '../../services/AIConfigService';
import { useTheme, getColors } from '../../context/ThemeContext';
import { MainStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'AIConfigEdit'>;
type RoutePropType = RouteProp<MainStackParamList, 'AIConfigEdit'>;

const AIConfigEditScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const { configId } = route.params || {};

  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<AIConfig>>({
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    maxTokens: 5000,
    temperature: 0,
    baseURL: 'https://api.openai.com/v1',
    thinking: 'disabled',
  });
  const [models, setModels] = useState<Array<{id: string, name: string, description?: string}>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [validationState, setValidationState] = useState<'none' | 'validating' | 'success' | 'error'>('none');
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [cachedModels, setCachedModels] = useState<Record<string, Array<{id: string, name: string}>>>({});

  // 新增：控制模型输入模式的状态
  const [useManualModelInput, setUseManualModelInput] = useState(false);

  // 下拉选择器状态 - 服务商选择
  const [providerOpen, setProviderOpen] = useState(false);
  const [providerValue, setProviderValue] = useState<string>('openai');
  const [providerItems, setProviderItems] = useState([
    { label: 'OpenAI', value: 'openai' },
    { label: 'Anthropic', value: 'anthropic' },
    { label: 'Google', value: 'google' },
    { label: 'DeepSeek', value: 'deepseek' },
    { label: '自定义(OpenAI兼容)', value: 'custom' },
  ]);

  // 下拉选择器状态 - 模型选择
  const [modelOpen, setModelOpen] = useState(false);
  const [modelValue, setModelValue] = useState<string>('gpt-3.5-turbo');
  const [modelItems, setModelItems] = useState<Array<{label: string, value: string}>>([]);

  const getCacheKey = useCallback((provider: string, apiKey: string) => {
    return `${provider}_${apiKey.substring(0, 10)}`;
  }, []);

  useEffect(() => {
    loadConfig();
  }, [configId]);

  // 当API Key或提供商变化时，触发模型加载
  useEffect(() => {
    if (editingConfig.apiKey && editingConfig.provider) {
      loadModels();
    } else {
      setModels([]);
      setModelLoadError(null);
    }
  }, [editingConfig.apiKey, editingConfig.provider]);

  // 当models变化时，更新模型下拉选择器的items，并检查是否需要启用手动输入模式
  useEffect(() => {
    const items = models.map(model => ({
      label: model.name || model.id,
      value: model.id,
    }));
    setModelItems(items);

    // 检查当前模型是否在模型列表中
    const currentModel = editingConfig.model;
    const isModelInList = models.some(model => model.id === currentModel);

    // 如果当前模型不在列表中，且是编辑现有配置，则启用手动输入模式
    if (configId && currentModel && !isModelInList) {
      setUseManualModelInput(true);
    } else {
      // 如果当前模型在列表中，确保使用下拉列表模式
      // 但只在不是手动输入模式时更新modelValue
      if (!useManualModelInput) {
        // 如果当前选择的模型不在列表中，且列表不为空，则选择第一个模型
        if (items.length > 0 && !items.some(item => item.value === modelValue)) {
          setModelValue(items[0].value);
          setEditingConfig(prev => ({ ...prev, model: items[0].value }));
        }
      }
    }
  }, [models, configId, editingConfig.model, useManualModelInput]);

  // 当providerValue变化时，更新editingConfig
  useEffect(() => {
    if (providerValue !== editingConfig.provider) {
      handleProviderSelect(providerValue as AIConfig['provider']);
    }
  }, [providerValue]);

  // 当modelValue变化时，更新editingConfig（仅在下拉列表模式下）
  useEffect(() => {
    if (!useManualModelInput && modelValue !== editingConfig.model) {
      setEditingConfig(prev => ({ ...prev, model: modelValue }));
    }
  }, [modelValue, useManualModelInput]);

  // 当切换到手动输入模式时，确保model值正确
  useEffect(() => {
    if (useManualModelInput) {
      // 如果当前modelValue不在模型列表中，保持当前值
      // 否则，使用editingConfig.model的值
    } else {
      // 切换到下拉列表模式时，确保modelValue与editingConfig.model同步
      if (editingConfig.model && editingConfig.model !== modelValue) {
        setModelValue(editingConfig.model);
      }
    }
  }, [useManualModelInput]);

  const loadConfig = async () => {
    try {
      if (configId) {
        // 编辑现有配置
        const config = await aiConfigService.getConfigById(configId);
        console.log('加载配置数据:', config);
        if (config) {
          setEditingConfig({
            ...config,
            thinking: config.thinking || 'disabled', // 确保thinking有默认值
          });
          setProviderValue(config.provider);
          setModelValue(config.model);
          // 注意：这里不设置 useManualModelInput，将在模型加载完成后决定
        }
      } else {
        // 新建配置，使用默认值
        const defaultConfig: Partial<AIConfig> = {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          maxTokens: 5000,
          temperature: 0,
          baseURL: 'https://api.openai.com/v1',
          thinking: 'disabled',
        };
        setEditingConfig(defaultConfig);
        setProviderValue('openai');
        setModelValue('gpt-3.5-turbo');
        setUseManualModelInput(false); // 新建时默认使用下拉列表
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      Alert.alert('错误', '加载配置失败');
    }
  };

  const loadModels = useCallback(async (immediate = false) => {
    if (!editingConfig.apiKey || !editingConfig.provider) {
      setModels([]);
      setModelLoadError(null);
      return;
    }

    // 如果不是立即加载，则设置防抖延迟
    if (!immediate) {
      setTimeout(() => loadModels(true), 500);
      return;
    }

    // 检查缓存
    const cacheKey = getCacheKey(editingConfig.provider, editingConfig.apiKey);
    const cached = cachedModels[cacheKey];

    if (cached && cached.length > 0) {
      console.log('使用缓存的模型列表');
      setModels(cached);
      setModelLoadError(null);

      // 检查当前选择的模型是否在缓存列表中
      if (cached.length > 0) {
        const currentModelExists = cached.some(model => model.id === modelValue);
        if (!currentModelExists && !useManualModelInput) {
          setModelValue(cached[0].id);
          setEditingConfig(prev => ({ ...prev, model: cached[0].id }));
        }
      }
      return;
    }

    // 所有提供商（包括自定义提供商）都可以尝试从API获取模型
    setLoadingModels(true);
    setModelLoadError(null);

    try {
      // 传递当前配置给 getAvailableModels
      const availableModels = await aiConfigService.getAvailableModels(editingConfig);

      // 更新缓存
      if (availableModels.length > 0) {
        setCachedModels(prev => ({
          ...prev,
          [cacheKey]: availableModels,
        }));
      }

      setModels(availableModels);

      // 如果当前选择的模型不在新获取的列表中，且列表不为空，则选择第一个模型
      if (availableModels.length > 0 && !useManualModelInput) {
        const currentModelExists = availableModels.some(model => model.id === modelValue);
        if (!currentModelExists) {
          setModelValue(availableModels[0].id);
          setEditingConfig(prev => ({ ...prev, model: availableModels[0].id }));
        }
      }

      // 如果没有获取到模型，设置错误信息
      if (availableModels.length === 0) {
        setModelLoadError('无法获取模型列表，可能是API Key无效或网络问题');
      }
    } catch (error: any) {
      console.error('加载模型列表失败:', error);
      setModels([]);
      setModelLoadError(`加载失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingModels(false);
    }
  }, [editingConfig, modelValue, cachedModels, getCacheKey, useManualModelInput]);

  const handleSave = async () => {
    if (!editingConfig.apiKey?.trim()) {
      Alert.alert('错误', '请输入API Key');
      return;
    }

    // 确保配置有名称
    const configToSave = {
      ...editingConfig,
      name: editingConfig.name || `${editingConfig.provider} 配置`,
    };

    setLoading(true);
    try {
      let success;

      if (configId) {
        // 更新现有配置
        success = await aiConfigService.updateConfig(configId, configToSave);
        if (success) {
          Alert.alert('成功', '配置已更新');
        }
      } else {
        // 创建新配置
        await aiConfigService.addConfig({
          name: configToSave.name,
          provider: configToSave.provider || 'openai',
          apiKey: configToSave.apiKey || '',
          model: configToSave.model || 'gpt-3.5-turbo',
          baseURL: configToSave.baseURL,
          maxTokens: configToSave.maxTokens,
          temperature: configToSave.temperature,
          thinking: configToSave.thinking || 'disabled',
        });
        success = true;
        Alert.alert('成功', '新配置已创建');
      }

      if (success) {
        // 保存成功后返回
        navigation.goBack();
      } else {
        Alert.alert('失败', '保存配置失败，请重试');
      }
    } catch (error: any) {
      Alert.alert('错误', error.message || '保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 创建验证配置的辅助函数
  const createValidationConfig = (): AIConfig => {
    return {
      id: configId || 'temp-validation-id',
      name: editingConfig.name || '验证配置',
      provider: editingConfig.provider || 'openai',
      apiKey: editingConfig.apiKey || '',
      model: editingConfig.model || 'gpt-3.5-turbo',
      baseURL: editingConfig.baseURL,
      maxTokens: editingConfig.maxTokens,
      temperature: editingConfig.temperature,
    };
  };

  // 解析错误消息的辅助函数
  const parseErrorMessage = (error: any): string => {
    if (!error) {return '未知错误';}

    // 如果是字符串类型的错误
    if (typeof error === 'string') {
      return error;
    }

    // 如果是Error对象
    if (error.message) {
      return error.message;
    }

    // 如果是包含status的对象
    if (error.status) {
      switch (error.status) {
        case 401:
          return 'API Key无效或已过期';
        case 403:
          return '权限不足，请检查API Key的权限设置';
        case 404:
          return 'API端点不存在，请检查API地址';
        case 429:
          return '请求过于频繁，请稍后再试';
        case 500:
          return '服务器内部错误，请稍后再试';
        case 503:
          return '服务暂时不可用，请稍后再试';
        default:
          return `服务器错误 (${error.status})`;
      }
    }

    // 如果是包含statusText的对象
    if (error.statusText) {
      return error.statusText;
    }

    // 默认返回
    return '验证过程中发生未知错误';
  };

  const handleValidate = async () => {
    if (!editingConfig.apiKey?.trim()) {
      Alert.alert('验证提示', '请输入API Key进行验证');
      return;
    }

    if (!editingConfig.provider) {
      Alert.alert('验证提示', '请选择AI服务商');
      return;
    }

    if (!editingConfig.model?.trim()) {
      Alert.alert('验证提示', '请选择或输入模型名称');
      return;
    }

    setValidating(true);
    setValidationState('validating');

    try {
      // 使用辅助函数创建验证配置
      const validationConfig = createValidationConfig();

      // 执行验证
      const isValid = await aiConfigService.validateConfig(validationConfig);

      if (isValid) {
        setValidationState('success');

        // 验证成功后自动加载模型列表
        await loadModels();

        // 显示成功消息
        Alert.alert(
          '验证成功',
          `✅ ${validationConfig.provider} 配置验证通过！\n\n` +
          'API Key: 有效\n' +
          `模型: ${validationConfig.model}\n` +
          `服务商: ${validationConfig.provider}`,
          [{ text: '确定' }]
        );

        // 如果验证成功且是新建配置，自动填充名称
        if (!editingConfig.name && !configId) {
          setEditingConfig(prev => ({
            ...prev,
            name: `${validationConfig.provider} 配置`,
          }));
        }
      } else {
        setValidationState('error');

        // 显示详细的错误信息
        Alert.alert(
          '验证失败',
          `❌ ${validationConfig.provider} 配置验证失败\n\n` +
          '可能的原因：\n' +
          '• API Key 无效或已过期\n' +
          '• 模型名称不正确\n' +
          '• API 地址配置错误\n' +
          '• 网络连接问题\n\n' +
          '请检查配置后重试。',
          [{ text: '确定' }]
        );
      }
    } catch (error: any) {
      setValidationState('error');

      // 解析并显示详细的错误信息
      const errorMessage = parseErrorMessage(error);
      console.error('验证失败详情:', error);

      Alert.alert(
        '验证异常',
        '❌ 验证过程中发生错误\n\n' +
        `错误信息: ${errorMessage}\n\n` +
        '建议操作：\n' +
        '1. 检查网络连接\n' +
        '2. 确认API Key权限\n' +
        '3. 验证API地址是否正确\n' +
        '4. 稍后重试',
        [{ text: '确定' }]
      );
    } finally {
      setValidating(false);

      // 3秒后重置验证状态（如果是错误状态）
      if (validationState === 'error') {
        setTimeout(() => {
          setValidationState('none');
        }, 3000);
      }
    }
  };

  const handleClear = async () => {
    Alert.alert(
      '确认',
      '确定要清除当前编辑的配置吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            const currentProvider = editingConfig.provider || 'openai';

            // 为当前供应商设置默认配置
            let defaultBaseURL = '';
            let defaultModel = '';
            switch (currentProvider) {
              case 'openai':
                defaultBaseURL = 'https://api.openai.com/v1';
                defaultModel = 'gpt-3.5-turbo';
                break;
              case 'anthropic':
                defaultBaseURL = 'https://api.anthropic.com/v1';
                defaultModel = 'claude-3-haiku-20240307';
                break;
              case 'google':
                defaultBaseURL = 'https://generativelanguage.googleapis.com/v1';
                defaultModel = 'gemini-pro';
                break;
              case 'deepseek':
                defaultBaseURL = 'https://api.deepseek.com';
                defaultModel = 'deepseek-chat';
                break;
              case 'custom':
                defaultBaseURL = '';
                defaultModel = '';
                break;
            }

            // 确保 model 有值
            const modelToUse = defaultModel || 'gpt-3.5-turbo';

            // 更新当前配置状态
            setEditingConfig({
              ...editingConfig,
              apiKey: '',
              model: modelToUse,
              baseURL: defaultBaseURL,
              maxTokens: 5000,
              temperature: 0,
              thinking: 'disabled',
            });
            setModelValue(modelToUse);

            // 重置验证状态和模型列表
            setValidationState('none');
            setModels([]);
          },
        },
      ]
    );
  };

  const handleProviderSelect = (provider: AIConfig['provider']) => {
    // 为每个提供商设置默认的 baseURL
    let defaultBaseURL = '';
    switch (provider) {
      case 'openai':
        defaultBaseURL = 'https://api.openai.com/v1';
        break;
      case 'anthropic':
        defaultBaseURL = 'https://api.anthropic.com/v1';
        break;
      case 'google':
        defaultBaseURL = 'https://generativelanguage.googleapis.com/v1';
        break;
      case 'deepseek':
        defaultBaseURL = 'https://api.deepseek.com';
        break;
      case 'custom':
        defaultBaseURL = '';
        break;
    }

    // 获取默认模型
    const defaultModel = getDefaultModelForProvider(provider);

    // 确定要使用的模型
    let modelToUse: string;

    if (useManualModelInput) {
      // 手动输入模式下：保留用户输入的模型名称，除非当前模型为空
      if (editingConfig.model && editingConfig.model.trim().length > 0) {
        modelToUse = editingConfig.model;
      } else {
        modelToUse = defaultModel;
      }
    } else {
      // 下拉列表模式下：使用默认模型
      modelToUse = defaultModel;
    }

    setEditingConfig({
      ...editingConfig,
      provider,
      baseURL: defaultBaseURL,
      model: modelToUse,
      // 保留现有的API Key，因为用户可能只是切换提供商但想使用相同的密钥
    });

    // 更新modelValue状态以保持同步
    // 注意：在手动输入模式下，modelValue可能不是最新的，所以我们需要同步它
    setModelValue(modelToUse);

    // 切换服务商时重置验证状态
    setValidationState('none');
    setModels([]);
    // 重置加载状态，取消任何正在进行的模型加载
    setLoadingModels(false);
  };

  // 辅助函数：获取默认模型
  const getDefaultModelForProvider = (provider: AIConfig['provider']): string => {
    switch (provider) {
      case 'deepseek':
        return 'deepseek-chat';
      case 'openai':
        return 'gpt-3.5-turbo';
      case 'anthropic':
        return 'claude-3-haiku-20240307';
      case 'google':
        return 'gemini-pro';
      case 'custom':
        return '';
      default:
        return 'gpt-3.5-turbo';
    }
  };

  const getApiKeyPlaceholder = (provider?: string) => {
    switch (provider) {
      case 'openai': return '输入OpenAI API Key';
      case 'anthropic': return '输入Anthropic API Key';
      case 'google': return '输入Google API Key';
      case 'deepseek': return '输入DeepSeek API Key';
      case 'custom': return '输入自定义API Key';
      default: return '输入API Key';
    }
  };

  const getApiKeyHelperText = (provider?: string) => {
    switch (provider) {
      case 'openai': return '可以在 OpenAI 官网获取API Key';
      case 'anthropic': return '可以在 Anthropic 官网获取API Key';
      case 'google': return '可以在 Google AI Studio 获取API Key';
      case 'deepseek': return '可以在 DeepSeek 官网获取API Key';
      case 'custom': return '请输入您的自定义API Key';
      default: return '请输入API Key';
    }
  };

  const getBaseURLHelperText = (provider?: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI官方API地址：https://api.openai.com/v1';
      case 'anthropic': return 'Anthropic官方API地址：https://api.anthropic.com/v1';
      case 'google': return 'Google官方API地址：https://generativelanguage.googleapis.com/v1';
      case 'deepseek': return 'DeepSeek官方API地址：https://api.deepseek.com';
      case 'custom': return '请输入您的自定义API地址（OpenAI兼容格式）';
      default: return '请输入API地址';
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* 页面标题 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: colors.text}]}>
              {configId ? '编辑配置' : '新建配置'}
              {configId && editingConfig.name && `: ${editingConfig.name}`}
            </Text>
          </View>

          {/* 配置名称 */}
          <View style={styles.section}>
            <Text style={[styles.label, {color: colors.text}]}>配置名称</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={editingConfig.name}
              onChangeText={(text) => setEditingConfig((prev: any) => ({ ...prev, name: text }))}
              placeholder="输入配置名称"
              placeholderTextColor={colors.hint}
            />
          </View>

          {/* 服务商选择 - 使用下拉框 */}
          <View style={styles.section}>
            <Text style={[styles.label, {color: colors.text}]}>AI服务商</Text>
            <DropDownPicker
              open={providerOpen}
              value={providerValue}
              items={providerItems}
              setOpen={setProviderOpen}
              setValue={setProviderValue}
              setItems={setProviderItems}
              searchable={true}
              listMode="MODAL"
              searchPlaceholder="输入关键词搜索..."
              style={[
                styles.dropdown,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                },
              ]}
              textStyle={[styles.dropdownText, {color: colors.text}]}
              dropDownContainerStyle={[
                styles.dropdownContainer,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                },
              ]}
              placeholder="选择AI服务商"
              zIndex={3000}
              zIndexInverse={1000}
            />
          </View>

          {/* API Key */}
          <View style={styles.section}>
            <View style={styles.labelContainer}>
              <Text style={[styles.label, {color: colors.text}]}>API Key *</Text>
              {validationState !== 'none' && (
                <View style={[
                  styles.validationStatusBadge,
                  {
                    backgroundColor: validationState === 'validating' ? colors.warning + '20' :
                                    validationState === 'success' ? colors.success + '20' :
                                    colors.error + '20',
                  },
                ]}>
                  <Text style={[
                    styles.validationStatusText,
                    {
                      color: validationState === 'validating' ? colors.warning :
                             validationState === 'success' ? colors.success :
                             colors.error,
                    },
                  ]}>
                    {validationState === 'validating' ? '验证中...' :
                     validationState === 'success' ? '验证成功' :
                     '验证失败'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.input,
                    color: colors.text,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                  validating && {
                    borderColor: colors.warning,
                    borderWidth: 2,
                  },
                  validationState === 'success' && {
                    borderColor: colors.success,
                    borderWidth: 2,
                  },
                  validationState === 'error' && {
                    borderColor: colors.error,
                    borderWidth: 2,
                  },
                ]}
                value={editingConfig.apiKey}
                onChangeText={(text) => {
                  setEditingConfig((prev: any) => ({ ...prev, apiKey: text }));
                  // 如果API Key发生变化，重置验证状态
                  if (validationState !== 'none') {
                    setValidationState('none');
                  }
                }}
                placeholder={getApiKeyPlaceholder(editingConfig.provider)}
                placeholderTextColor={colors.hint}
                secureTextEntry
                multiline
                numberOfLines={2}
                editable={!validating}
              />
              {validating && (
                <View style={styles.inputLoading}>
                  <ActivityIndicator size="small" color={colors.warning} />
                </View>
              )}
              {validationState === 'success' && !validating && (
                <View style={styles.inputSuccess}>
                  <Icon name="check-circle" type="material" color={colors.success} size={20} />
                </View>
              )}
              {validationState === 'error' && !validating && (
                <View style={styles.inputError}>
                  <Icon name="error" type="material" color={colors.error} size={20} />
                </View>
              )}
            </View>
            <Text style={[styles.helperText, {color: colors.secondaryText}]}>
              {getApiKeyHelperText(editingConfig.provider)}
            </Text>

            {/* 验证状态详细提示 */}
            {validationState === 'validating' && (
              <View style={[styles.validationDetailContainer, {backgroundColor: colors.warning + '10'}]}>
                <ActivityIndicator size="small" color={colors.warning} style={styles.validationDetailIcon} />
                <Text style={[styles.validationDetailText, {color: colors.warning}]}>
                  正在验证API Key，请稍候...
                </Text>
              </View>
            )}
            {validationState === 'error' && (
              <View style={[styles.validationDetailContainer, {backgroundColor: colors.error + '10'}]}>
                <Icon name="error-outline" type="material" color={colors.error} size={16} style={styles.validationDetailIcon} />
                <Text style={[styles.validationDetailText, {color: colors.error}]}>
                  API Key验证失败，请检查：
                  1. API Key是否正确
                  2. 服务商选择是否匹配
                  3. 网络连接是否正常
                </Text>
              </View>
            )}
          </View>

          {/* 模型选择 */}
          <View style={styles.section}>
            <View style={styles.modelHeader}>
              <Text style={[styles.label, {color: colors.text}]}>模型</Text>
              <View style={styles.modelModeToggle}>
                <Text style={[styles.modelModeLabel, {color: colors.secondaryText}]}>
                  {useManualModelInput ? '手动输入' : '从列表选择'}
                </Text>
                <Switch
                  value={useManualModelInput}
                  onValueChange={(value) => {
                    setUseManualModelInput(value);
                    // 切换模式时，如果是从手动输入切换到列表选择，尝试同步模型值
                    if (!value && editingConfig.model) {
                      setModelValue(editingConfig.model);
                    }
                  }}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.background}
                />
              </View>
            </View>

            {useManualModelInput ? (
              // 手动输入模式
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.input,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={editingConfig.model || ''}
                onChangeText={(text) => setEditingConfig((prev: any) => ({ ...prev, model: text }))}
                placeholder="输入模型名称，例如：gpt-4-turbo"
                placeholderTextColor={colors.hint}
              />
            ) : (
              // 下拉列表模式
              <>
                <DropDownPicker
                  open={modelOpen}
                  value={modelValue}
                  items={modelItems}
                  setOpen={setModelOpen}
                  setValue={setModelValue}
                  setItems={setModelItems}
                  searchable={true}
                  listMode="MODAL"
                  searchPlaceholder="输入关键词搜索模型..."
                  style={[
                    styles.dropdown,
                    {
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                    },
                  ]}
                  textStyle={[styles.dropdownText, {color: colors.text}]}
                  dropDownContainerStyle={[
                    styles.dropdownContainer,
                    {
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                    },
                  ]}
                  loading={loadingModels}
                  disabled={loadingModels || !editingConfig.apiKey}
                  zIndex={2000}
                  zIndexInverse={2000}
                />
                {modelLoadError && (
                  <Text style={[styles.errorText, {color: colors.error}]}>{modelLoadError}</Text>
                )}
                {loadingModels && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.loadingText, {color: colors.secondaryText}]}>正在加载模型列表...</Text>
                  </View>
                )}
              </>
            )}
            <Text style={[styles.helperText, {color: colors.secondaryText}]}>
              {useManualModelInput
                ? '请输入完整的模型名称，确保与所选服务商兼容'
                : '从列表中选择模型，或切换到手动输入模式'}
            </Text>
          </View>

          {/* 高级设置开关 */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text style={[styles.advancedToggleText, {color: colors.primary}]}>
                {showAdvanced ? '隐藏高级设置' : '显示高级设置'}
              </Text>
              <Icon
                name={showAdvanced ? 'expand-less' : 'expand-more'}
                type="material"
                color={colors.primary}
                size={20}
              />
            </TouchableOpacity>
          </View>

          {/* 高级设置 */}
          {showAdvanced && (
            <>
              {/* API地址 */}
              <View style={styles.section}>
                <Text style={[styles.label, {color: colors.text}]}>API地址</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.input,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={editingConfig.baseURL}
                  onChangeText={(text) => setEditingConfig((prev: any) => ({ ...prev, baseURL: text }))}
                  placeholder={getBaseURLHelperText(editingConfig.provider)}
                  placeholderTextColor={colors.hint}
                />
                <Text style={[styles.helperText, {color: colors.secondaryText}]}>
                  {getBaseURLHelperText(editingConfig.provider)}
                </Text>
              </View>

              {/* 最大令牌数 */}
              <View style={styles.section}>
                <Text style={[styles.label, {color: colors.text}]}>最大令牌数</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.input,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={editingConfig.maxTokens?.toString() || ''}
                  onChangeText={(text) => {
                    const num = parseInt(text, 10);
                    if (!isNaN(num) && num > 0) {
                      setEditingConfig((prev: any) => ({ ...prev, maxTokens: num }));
                    } else if (text === '') {
                      setEditingConfig((prev: any) => ({ ...prev, maxTokens: undefined }));
                    }
                  }}
                  placeholder="例如：5000"
                  placeholderTextColor={colors.hint}
                  keyboardType="numeric"
                />
                <Text style={[styles.helperText, {color: colors.secondaryText}]}>
                  控制AI回复的最大长度，建议值：1000-8000
                </Text>
              </View>

              {/* 温度 */}
              <View style={styles.section}>
                <Text style={[styles.label, {color: colors.text}]}>温度 (0-2)</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.input,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={editingConfig.temperature?.toString() || ''}
                  onChangeText={(text) => {
                    const num = parseFloat(text);
                    if (!isNaN(num) && num >= 0 && num <= 2) {
                      setEditingConfig((prev: any) => ({ ...prev, temperature: num }));
                    } else if (text === '') {
                      setEditingConfig((prev: any) => ({ ...prev, temperature: undefined }));
                    }
                  }}
                  placeholder="例如：0.7"
                  placeholderTextColor={colors.hint}
                  keyboardType="numeric"
                />
                <Text style={[styles.helperText, {color: colors.secondaryText}]}>
                  控制AI回复的随机性，0表示最确定，2表示最随机
                </Text>
              </View>

              {/* 思考模式开关 */}
              <View style={styles.section}>
                <View style={styles.switchContainer}>
                  <View style={styles.switchLabelContainer}>
                    <Text style={[styles.label, {color: colors.text}]}>思考模式</Text>
                    <Text style={[styles.helperText, {color: colors.secondaryText, marginLeft: 8}]}>
                      （需模型支持）
                    </Text>
                  </View>
                  <Switch
                    value={editingConfig.thinking === 'enabled'}
                    onValueChange={(value) => {
                      setEditingConfig((prev: any) => ({
                        ...prev,
                        thinking: value ? 'enabled' : 'disabled',
                      }));
                    }}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.background}
                  />
                </View>
                <Text style={[styles.helperText, {color: colors.secondaryText, marginTop: 4}]}>
                  开启思考模式（需模型支持）
                </Text>
              </View>
            </>
          )}

          {/* 操作按钮 */}
          <View style={styles.section}>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.validateButton, {backgroundColor: colors.warning}]}
                onPress={handleValidate}
                disabled={validating}
              >
                {validating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>验证配置</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.clearButton, {backgroundColor: colors.error}]}
                onPress={handleClear}
              >
                <Text style={styles.buttonText}>清除</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, styles.saveButton, {backgroundColor: colors.primary}]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{configId ? '更新配置' : '保存配置'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  validationStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  validationStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 44,
  },
  inputContainer: {
    position: 'relative',
  },
  inputLoading: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  inputSuccess: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  inputError: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  validationDetailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  validationDetailIcon: {
    marginRight: 8,
  },
  validationDetailText: {
    fontSize: 12,
    flex: 1,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 44,
  },
  dropdownText: {
    fontSize: 14,
  },
  dropdownContainer: {
    borderWidth: 1,
    borderRadius: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  loadingText: {
    fontSize: 12,
    marginLeft: 8,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  validateButton: {
    flex: 1,
    marginRight: 8,
  },
  clearButton: {
    flex: 1,
    marginLeft: 8,
  },
  saveButton: {
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  // 新增样式
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modelModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelModeLabel: {
    fontSize: 12,
    marginRight: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  switchLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default AIConfigEditScreen;
