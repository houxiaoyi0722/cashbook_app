import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity, Image, FlatList, StatusBar, Platform, KeyboardAvoidingView } from 'react-native';
import { Text, Card, Button, Input, ButtonGroup, Divider, Icon, Overlay } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MainStackParamList } from '../../navigation/types';
import api from '../../services/api';
import {useBookkeeping} from '../../context/BookkeepingContext.tsx';
import {eventBus} from '../../navigation';
import {useAuth} from '../../context/AuthContext.tsx';
import * as ImagePicker from 'react-native-image-picker';
import ImageViewer from 'react-native-image-zoom-viewer';
import dayjs from 'dayjs';
import ImageCacheService from '../../services/ImageCacheService';
import { useTheme, getColors } from '../../context/ThemeContext';
import LocalCacheService from '../../services/LocalCacheService';
import AsyncStorage from '@react-native-async-storage/async-storage';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, 'FlowForm'>;

const flowTypes = ['收入', '支出', '不计收支'] as const;
type FlowType = typeof flowTypes[number];

// 用于 ButtonGroup 的可变数组
const flowTypeButtons = [...flowTypes];

const defaultIndustryTypes = {
  '收入': ['工资', '奖金', '转账红包', '其他'],
  '支出': ['餐饮美食', '日用百货', '交通出行', '充值缴费', '服饰装扮', '公共服务', '商业服务', '家居家装', '文化休闲', '爱车养车', '生活服务', '运动户外', '亲友代付', '其他'],
  '不计收支': ['信用借还', '投资理财', '退款', '报销', '收款', '其他'],
};

// 融合接口数据和固定数据后去重,固定数据交由设置页面编辑
const defaultPayTypes = ['现金', '支付宝', '微信', '银行卡', '信用卡', '其他'];

const FlowFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { currentFlow, date, ocrResult } = route.params || {};
  const { currentBook, remotePayType, remoteAttributions, addFlow } = useBookkeeping();
  const {userInfo} = useAuth();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // 检查离线模式状态
  useEffect(() => {
    const checkOfflineMode = async () => {
      try {
        const offlineMode = await AsyncStorage.getItem('offline_mode');
        setIsOfflineMode(offlineMode === 'true');
      } catch (error) {
        console.error('检查离线模式失败:', error);
      }
    };
    checkOfflineMode();
  }, []);

  const [name, setName] = useState('');
  const [money, setMoney] = useState('');
  const [description, setDescription] = useState('');
  const [flowType, setFlowType] = useState<FlowType>('支出');
  const [industryType, setIndustryType] = useState('');
  const [payType, setPayType] = useState('');
  const [flowDate, setFlowDate] = useState(date ? new Date(date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [attribution, setAttribution] = useState<string>('');

  const [industryTypes, setIndustryTypes] = useState<string[]>([]);
  const [payTypes, setPayTypes] = useState<string[]>([]);
  const [attributions, setAttributions] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching] = useState(false);

  const [invoiceImages, setInvoiceImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cachedImages, setCachedImages] = useState<Set<string>>(new Set());

  // 新增状态：用于处理新建流水时的图片
  const [localInvoiceAssets, setLocalInvoiceAssets] = useState<ImagePicker.Asset[]>([]);
  const [localInvoiceUris, setLocalInvoiceUris] = useState<string[]>([]);
  const [pendingUploadImages, setPendingUploadImages] = useState<boolean>(false);
  // 新增状态：用于存储待删除的已上传图片名称
  const [pendingDeleteImages, setPendingDeleteImages] = useState<Set<string>>(new Set());

  // 处理OCR识别结果中的图片
  useEffect(() => {
    const handleOCRResult = async () => {
      if (ocrResult && ocrResult?.imageUri) {
        try {
          // 创建一个简化的模拟ImagePicker.Asset对象，只包含必要的属性
          const mockAsset: ImagePicker.Asset = {
            uri: ocrResult.imageUri,
            fileName: `ocr_${Date.now()}.jpg`,
            type: 'image/jpeg',
            width: 1200,
            height: 1200,
            fileSize: 0,
          };

          // 添加到本地暂存列表
          setLocalInvoiceAssets(prev => [...prev, mockAsset]);
          // 确保uri存在后再添加到localInvoiceUris
          if (ocrResult.imageUri) {
            setLocalInvoiceUris(prev => [...prev, ocrResult.imageUri as string]);
          }
          setPendingUploadImages(true);

          console.log('OCR识别图片已添加到暂存列表:', ocrResult.imageUri);
        } catch (error) {
          console.error('处理OCR识别图片失败:', error);
        }
      }
    };

    handleOCRResult();
  }, [ocrResult]);

  const [editingOption, setEditingOption] = useState<{
    type: 'industryType' | 'payType' | 'attribution';
    value: string;
  } | null>(null);
  const [newOptionValue, setNewOptionValue] = useState('');

  // 获取流水详情（支持离线）
  useEffect(() => {
    const fetchFlowDetail = async () => {
      try {
        // 优先使用本地缓存
        const cachedIndustryTypes = await LocalCacheService.getIndustryTypes(flowType);
        const cachedPayTypes = await LocalCacheService.getPayTypes();
        const cachedAttributions = await LocalCacheService.getAttributions();

        let mergedPayTypes = cachedPayTypes;
        let mergedAttributions = [...cachedAttributions];
        // 如果有用户信息且不在列表中，则添加到开头
        if (userInfo?.name && !mergedAttributions.includes(userInfo.name)) {
          mergedAttributions.unshift(userInfo.name);
        }
        let mergedIndustryTypes = cachedIndustryTypes;

        // 尝试从服务器获取最新数据（仅在在线模式下）
        if (currentBook?.bookId && !isOfflineMode) {
          try {
            const apiResponse = await api.flow.industryType(currentBook.bookId, flowType);
            const serverIndustryTypes = apiResponse.d.map(item => item.industryType);

            // 合并服务器数据到本地缓存
            await LocalCacheService.mergeServerData(
              { [flowType]: serverIndustryTypes },
              remotePayType,
              remoteAttributions
            );

            // 更新合并后的数据
            mergedIndustryTypes = [...new Set([...cachedIndustryTypes, ...serverIndustryTypes])];
            mergedPayTypes = [...new Set([...cachedPayTypes, ...remotePayType])];
            mergedAttributions = [...new Set([...mergedAttributions, ...remoteAttributions])];
          } catch (error) {
            console.log('服务器数据获取失败，使用本地缓存:', error);
            // 服务器获取失败时，继续使用本地缓存数据
          }
        }

        const initFlow = ocrResult?.flow || currentFlow;

        // 处理当前流水数据
        if (initFlow) {
          setName(initFlow.name);
          setMoney(initFlow.money.toString());
          setDescription(initFlow.description || '');
          setFlowType(initFlow.flowType);
          setIndustryType(initFlow.industryType);
          setPayType(initFlow.payType);
          setFlowDate(new Date(initFlow.day));
          setAttribution(initFlow.attribution || '');

          // 确保当前流水的选项在列表中
          if (initFlow.payType) {
            mergedPayTypes.unshift(initFlow.payType);
            mergedPayTypes = [...new Set([...mergedPayTypes])];
          }
          if (initFlow.attribution) {
            mergedAttributions.unshift(initFlow.attribution);
            mergedAttributions = [...new Set([...mergedAttributions])];
          }
          if (initFlow.industryType) {
            mergedIndustryTypes.unshift(initFlow.industryType);
            mergedIndustryTypes = [...new Set([...mergedIndustryTypes])];
          }

          // 加载小票图片
          if (initFlow.invoice) {
            const invoiceNames = initFlow.invoice.split(',');
            setInvoiceImages(invoiceNames);

            try {
              // 预缓存图片
              await Promise.all(
                invoiceNames.map(async (name) => {
                  await ImageCacheService.cacheImage(name);
                  setCachedImages(prev => new Set([...prev, name]));
                })
              );
              // 更新刷新键以强制刷新组件
              setRefreshKey(prev => prev + 1);
            } catch (error) {
              console.error('缓存图片失败:', error);
            }
          }
        }

        setPayTypes(mergedPayTypes);
        setAttributions(mergedAttributions);
        setIndustryTypes(mergedIndustryTypes);

      } catch (error) {
        console.error('获取流水详情失败:', error);
        // 使用默认数据
        setPayTypes(defaultPayTypes);
        const defaultAttributions = ['自己', '配偶', '其他'];
        if (userInfo?.name && !defaultAttributions.includes(userInfo.name)) {
          defaultAttributions.unshift(userInfo.name);
        }
        setAttributions(defaultAttributions);
        setIndustryTypes(defaultIndustryTypes[flowType] || []);
      }
    };

    fetchFlowDetail();
  }, [currentFlow, flowType, currentBook, ocrResult]);

  // 处理流类型变化（支持离线）
  useEffect(() => {
    const flowTypeChange = async () => {
      try {
        const cachedIndustryTypes = await LocalCacheService.getIndustryTypes(flowType);
        let merged = cachedIndustryTypes;

        // 尝试从服务器获取最新数据（仅在在线模式下）
        if (currentBook?.bookId && !isOfflineMode) {
          try {
            const apiResponse = await api.flow.industryType(currentBook.bookId, flowType);
            const serverIndustryTypes = apiResponse.d.map(item => item.industryType);

            // 合并数据
            merged = [...new Set([...cachedIndustryTypes, ...serverIndustryTypes])];

            // 更新缓存
            await LocalCacheService.mergeServerData(
              { [flowType]: serverIndustryTypes },
              [],
              []
            );
          } catch (error) {
            console.log('服务器数据获取失败，使用本地缓存:', error);
          }
        }

        // 确保当前流水的行业类型在列表中
        const initFlow = ocrResult?.flow || currentFlow;
        if (initFlow?.industryType && !merged.includes(initFlow.industryType)) {
          merged.unshift(initFlow.industryType);
        }

        setIndustryTypes(merged);
      } catch (error) {
        console.error('流类型变化处理失败:', error);
        setIndustryTypes(defaultIndustryTypes[flowType] || []);
      }
    };

    flowTypeChange();
  }, [flowType, currentBook]);

  // 当获取到认证令牌后，预加载图片
  useEffect(() => {
    if (invoiceImages.length > 0) {
      ImageCacheService.cacheImages(invoiceImages);
    }
  }, [invoiceImages]);

  // 验证表单
  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('错误', '请输入交易方名称');
      return false;
    }

    if (!money || isNaN(Number(money)) || Number(money) <= 0) {
      Alert.alert('错误', '请输入有效的金额');
      return false;
    }

    if (!industryType) {
      Alert.alert('错误', '请选择交易类型');
      return false;
    }

    if (!payType) {
      Alert.alert('错误', '请选择支付方式');
      return false;
    }

    return true;
  };

  // 处理保存
  const handleSave = async () => {
    if (!validateForm() || !currentBook) {return;}

    try {
      setIsLoading(true);

      if (currentFlow) {
        // 更新流水
        await api.flow.update({
          id: currentFlow.id,
          bookId: currentBook.bookId,
          name,
          money: Number(money),
          flowType,
          industryType,
          payType,
          attribution,
          description: description.trim() || undefined,
          day: dayjs(flowDate).format('YYYY-MM-DD'),
        });

        // 如果有暂存图片需要上传
        if (pendingUploadImages && localInvoiceAssets.length > 0) {
          try {
            await uploadPendingImages(currentFlow.id, currentBook.bookId);
          } catch (uploadError) {
            console.error('上传暂存图片失败:', uploadError);
            // 不阻止导航，但记录错误
            Alert.alert('提示', '流水更新成功，但部分图片上传失败');
          }
        }

        // 处理待删除的图片
        if (pendingDeleteImages.size > 0) {
          try {
            // 批量删除待删除的图片
            for (const imageName of pendingDeleteImages) {
              await api.flow.deleteInvoice(
                currentFlow.id,
                currentBook.bookId,
                imageName
              );
              // 从缓存中清除图片
              await ImageCacheService.clearCache(imageName);
            }
            console.log('已删除待删除图片:', Array.from(pendingDeleteImages));
          } catch (deleteError) {
            console.error('删除待删除图片失败:', deleteError);
            // 不阻止保存，但记录错误
            Alert.alert('提示', '流水保存成功，但部分图片删除失败');
          }
        }

        // 清空待删除图片列表
        setPendingDeleteImages(new Set());

        eventBus.emit('refreshCalendarFlows');
        navigation.goBack();
      } else {
        // 创建流水 - 使用BookkeepingContext的addFlow方法
        const flowData = {
          bookId: currentBook.bookId,
          name,
          money: Number(money),
          flowType,
          industryType,
          payType,
          attribution,
          description: description.trim() || undefined,
          day: dayjs(flowDate).format('YYYY-MM-DD'),
        };

        const newFlow = await addFlow(flowData);

        // 如果有暂存图片需要上传
        if (pendingUploadImages && localInvoiceAssets.length > 0 && newFlow?.id) {
          try {
            await uploadPendingImages(newFlow.id, currentBook.bookId);
          } catch (uploadError) {
            console.error('上传暂存图片失败:', uploadError);
            // 不阻止导航，但记录错误
            Alert.alert('提示', '流水保存成功，但部分图片上传失败');
          }
        }

        eventBus.emit('refreshCalendarFlows');
        navigation.goBack();
      }
    } catch (error) {
      console.error('保存流水失败', error);
      Alert.alert('错误', '保存流水失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理日期变更
  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFlowDate(selectedDate);
    }
  };

  // 处理小票上传
  const handleInvoiceUpload = async () => {
    if (!currentBook) {
      Alert.alert('提示', '请先选择账本');
      return;
    }

    Alert.alert(
      '选择图片来源',
      '请选择小票图片来源',
      [
        {
          text: '相机',
          onPress: () => launchCamera(),
        },
        {
          text: '相册',
          onPress: () => launchImageLibrary(),
        },
        {
          text: '取消',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  // 启动相机
  const launchCamera = async () => {
    try {
      const result = await ImagePicker.launchCamera({
        mediaType: 'photo',
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
      });

      if (result.assets && result.assets.length > 0) {
        uploadImage(result.assets[0]);
      }
    } catch (error) {
      console.error('相机启动失败', error);
      Alert.alert('错误', '无法启动相机');
    }
  };

  // 启动图片库
  const launchImageLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
      });

      if (result.assets && result.assets.length > 0) {
        uploadImage(result.assets[0]);
      }
    } catch (error) {
      console.error('图片库启动失败', error);
      Alert.alert('错误', '无法打开图片库');
    }
  };

  // 上传暂存图片的辅助函数
  const uploadPendingImages = async (flowId: number, bookId: string) => {
    if (localInvoiceAssets.length === 0) {
      return;
    }

    try {
      setUploadingImage(true);
      // 上传所有本地暂存图片
      for (const asset of localInvoiceAssets) {
        await api.flow.uploadInvoice(flowId, bookId, asset);
      }
      console.log('所有暂存图片上传完成');

      // 清空暂存列表
      setLocalInvoiceAssets([]);
      setLocalInvoiceUris([]);
      setPendingUploadImages(false);

      // 如果是更新场景，刷新图片列表
      if (currentFlow) {
        const updatedFlowResponse = await api.flow.list({
          id: flowId,
          bookId: bookId,
        });

        if (updatedFlowResponse.c === 200 && updatedFlowResponse.d.length > 0) {
          const updatedFlow = updatedFlowResponse.d.find(flow => flow.id === flowId);
          if (updatedFlow && updatedFlow.invoice) {
            const invoiceNames = updatedFlow.invoice.split(',');

            try {
              // 只缓存新上传的图片
              const newInvoices = invoiceNames.filter(name => !cachedImages.has(name));
              await Promise.all(
                newInvoices.map(async (name) => {
                  await ImageCacheService.cacheImage(name);
                  setCachedImages(prev => new Set([...prev, name]));
                })
              );
              // 更新刷新键以强制刷新组件
              setRefreshKey(prev => prev + 1);
            } catch (error) {
              console.error('缓存新上传图片失败:', error);
            }

            // 更新小票列表
            setInvoiceImages(invoiceNames);
          }
        }
      }
    } catch (uploadError) {
      console.error('上传暂存图片失败:', uploadError);
      throw uploadError;
    } finally {
      setUploadingImage(false);
    }
  };

  // 上传图片
  const uploadImage = async (image: ImagePicker.Asset) => {
    if (!currentBook) {return;}

    try {
      setUploadingImage(true);

      // 无论是新建还是更新场景，都先将图片添加到本地暂存列表
      setLocalInvoiceAssets(prev => [...prev, image]);
      // 确保uri存在且是字符串后再添加到localInvoiceUris
      if (image.uri) {
        setLocalInvoiceUris(prev => [...prev, image.uri as string]);
      }
      // 标记有图片待上传
      setPendingUploadImages(true);

    } catch (error) {
      console.error('添加图片到暂存列表失败', error);
      Alert.alert('错误', '添加图片失败');
    } finally {
      setUploadingImage(false);
    }
  };

  // 查看小票图片（仅用于已上传的图片）
  const viewInvoiceImage = (invoiceName: string) => {
    setSelectedImage(invoiceName);
    setShowImageViewer(true);

    // 尝试缓存当前查看的图片
    ImageCacheService.cacheImage(invoiceName);
  };

  // 删除小票图片（仅用于已上传的图片）
  const deleteInvoiceImage = async () => {
    if (!selectedImage) {return;}

    Alert.alert(
      '确认删除',
      '确定要删除这张小票图片吗？',
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              setUploadingImage(true);
              if (selectedImage.startsWith('file://')) {
                // 对于本地暂存图片，直接移除
                setLocalInvoiceAssets(prev => prev.filter(image => image.uri !== selectedImage));
                setLocalInvoiceUris(prev => prev.filter(uri => uri !== selectedImage));
                setSelectedImage(null);
              } else {
                // 对于已上传的图片，添加到待删除列表，不立即调用API
                setPendingDeleteImages(prev => {
                  const newSet = new Set(prev);
                  newSet.add(selectedImage);
                  return newSet;
                });
                // 从invoiceImages中移除，但保留在pendingDeleteImages中
                // 这样在保存时会处理删除
                setSelectedImage(null);
              }
              setShowImageViewer(false);
            } catch (error) {
              console.error('小票删除失败', error);
              Alert.alert('错误', '小票删除失败');
            } finally {
              setUploadingImage(false);
            }
          },
        },
      ]
    );
  };

  // 渲染小票图片列表
  const renderInvoiceImages = () => {
    // 过滤掉待删除的已上传图片
    let filteredInvoiceImages = invoiceImages;
    if (pendingDeleteImages.size > 0) {
      filteredInvoiceImages = invoiceImages.filter(uri => !pendingDeleteImages.has(uri));
    }
    // 合并已上传的图片和本地图片，确保所有URI都是字符串
    const allImages = [
      ...filteredInvoiceImages
        .map(uri => ({ type: 'uploaded' as const, uri })),
      ...localInvoiceUris
        .map(uri => ({ type: 'local' as const, uri })),
    ];

    return (
      <View style={styles.invoiceContainer}>
        <Text style={[styles.label, { color: colors.text }]}>小票图片</Text>
        <View style={styles.invoiceListContainer}>
          <TouchableOpacity
            style={[styles.addInvoiceButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleInvoiceUpload}
            disabled={isLoading || uploadingImage}
          >
            <Icon name="add-a-photo" type="material" color={colors.primary} size={24} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>上传小票</Text>
          </TouchableOpacity>

          <FlatList
            key={`invoice-list-${refreshKey}`} // 使用key强制刷新
            data={allImages}
            horizontal
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.invoiceImageContainer}
                onPress={() => {
                  if (item.type === 'uploaded') {
                    viewInvoiceImage(item.uri);
                  } else {
                    // 对于本地图片，直接显示
                    setSelectedImage(item.uri);
                    setShowImageViewer(true);
                  }
                }}
              >
                <View style={[
                  styles.invoiceImageWrapper,
                  { borderColor: colors.border },
                  item.type === 'local' && styles.localImageWrapper,
                ]}>
                  <Image
                    source={{
                      uri: item.type === 'uploaded' ? ImageCacheService.getImageUrl(item.uri) : item.uri,
                    }}
                    style={styles.invoiceImage}
                    resizeMode="cover"
                  />
                  {item.type === 'uploaded' && !ImageCacheService.isImageCached(item.uri) && (
                    <ActivityIndicator
                      style={styles.thumbnailLoading}
                      size="small"
                      color={colors.primary}
                    />
                  )}
                  {item.type === 'local' && (
                    <View style={styles.localImageBadge}>
                      <Text style={styles.localImageBadgeText}>本地</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => `${item.type}-${item.uri}-${index}`}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };

  // 渲染小票图片查看器
  const renderImageViewer = () => (
    <Overlay
      isVisible={showImageViewer && !!selectedImage}
      onBackdropPress={() => setShowImageViewer(false)}
      overlayStyle={[styles.imageViewerOverlay, { backgroundColor: colors.background }]}
    >
      <View style={styles.imageViewerContainer}>
        {selectedImage && (
          <ImageViewer
            imageUrls={[{
              url: ImageCacheService.getImageUrl(selectedImage),
            }]}
            enableSwipeDown={true}
            onSwipeDown={() => setShowImageViewer(false)}
            enableImageZoom={true}
            saveToLocalByLongPress={false}
            backgroundColor={colors.background}
            loadingRender={() => (
              <View style={styles.imageLoadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.imageLoadingText, { color: colors.text }]}>图片加载中...</Text>
              </View>
            )}
          />
        )}
        <View style={styles.imageViewerButtons}>
          <Button
            icon={<Icon name="close" type="material" color="white" size={24} />}
            buttonStyle={styles.closeButton}
            onPress={() => setShowImageViewer(false)}
          />
          <Button
            icon={<Icon name="delete" type="material" color="white" size={24} />}
            buttonStyle={[styles.deleteButton, { backgroundColor: colors.error }]}
            onPress={deleteInvoiceImage}
          />
        </View>
      </View>
    </Overlay>
  );

  // 处理双击编辑选项
  const handleDoubleClick = (type: 'industryType' | 'payType' | 'attribution', value: string) => {
    setEditingOption({ type, value });
    setNewOptionValue(value);
  };

  // 保存编辑后的选项
  const saveEditedOption = async () => {
    if (!newOptionValue.trim()) {
      setEditingOption(null);
      return;
    }

    const { type } = editingOption!;
    console.log('saveEditedOption',editingOption, newOptionValue);
    // 更新相应的选项列表和当前选中值
    if (type === 'industryType') {
      // 如果新值不在列表中，添加到列表
      if (!industryTypes.includes(newOptionValue)) {
        setIndustryTypes(prev => [newOptionValue,...prev]);
      }
      // 更新当前选中的值
      setIndustryType(newOptionValue);
    } else if (type === 'payType') {
      if (!payTypes.includes(newOptionValue)) {
        setPayTypes(prev => [newOptionValue,...prev]);
      }
      setPayType(newOptionValue);
    } else if (type === 'attribution') {
      if (!attributions.includes(newOptionValue)) {
        setAttributions(prev => [newOptionValue,...prev]);
      }
      setAttribution(newOptionValue);
    }

    // 将用户自定义选项保存到本地缓存
    await LocalCacheService.addCustomOption(type, newOptionValue, type === 'industryType' ? flowType : undefined);

    // 关闭编辑模式
    setEditingOption(null);
  };

  // 渲染编辑选项的 Overlay
  const renderEditOptionOverlay = () => (
    <Overlay
      isVisible={!!editingOption}
      onBackdropPress={() => setEditingOption(null)}
      overlayStyle={[styles.editOptionOverlay, { backgroundColor: colors.card }]}
    >
      <View style={styles.editOptionContainer}>
        <Text style={[styles.editOptionTitle, { color: colors.text }]}>
          编辑{editingOption?.type === 'industryType' ? '交易类型' :
               editingOption?.type === 'payType' ? '支付方式' : '归属人'}
        </Text>

        <Input
          value={newOptionValue}
          onChangeText={setNewOptionValue}
          placeholder="请输入新的选项值"
          containerStyle={styles.editOptionInput}
          autoFocus
          labelStyle={{ color: colors.text }}
          inputStyle={[{ color: colors.text }, { paddingVertical: 0 }]}
        />

        <View style={styles.editOptionButtons}>
          <Button
            title="取消"
            type="outline"
            containerStyle={styles.editOptionButton}
            onPress={() => setEditingOption(null)}
            titleStyle={{ color: colors.primary }}
            buttonStyle={{ borderColor: colors.primary }}
          />

          <Button
            title="保存"
            containerStyle={styles.editOptionButton}
            onPress={saveEditedOption}
            titleStyle={{ color: 'white' }}
            buttonStyle={{ backgroundColor: colors.primary }}
          />
        </View>
      </View>
    </Overlay>
  );

  if (isFetching) {
    return (
      <>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.statusBar} />
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.statusBar} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true} bounces={true} alwaysBounceVertical={false}>
            {/* 离线模式提示 */}
            {isOfflineMode && (
              <View style={[styles.offlineBanner, { backgroundColor: '#ff9800' }]}>
                <Text style={[styles.offlineBannerText, { color: 'white' }]}>
                  离线模式：数据将保存到本地
                </Text>
              </View>
            )}

            <Card containerStyle={[styles.card,{backgroundColor: colors.card, borderColor: colors.border}]}>
              <Card.Title style={{color: colors.text}}>{currentFlow ? '编辑流水' : '创建流水'}</Card.Title>

              <ButtonGroup
                buttons={flowTypeButtons}
                selectedIndex={flowTypes.indexOf(flowType)}
                onPress={(index) => setFlowType(flowTypes[index])}
                containerStyle={[styles.buttonGroup,{backgroundColor: colors.card, borderColor: colors.border}]}
                textStyle={{color: colors.text}}
                selectedButtonStyle={{ backgroundColor: '#1976d2' }}
                disabled={isLoading}
              />

              <Input
                label="交易方名称"
                placeholder="请输入交易方名称"
                value={name}
                labelStyle={{ color: colors.text }}
                inputStyle={[{ fontSize: 14, lineHeight: 18, paddingVertical: 4, color: colors.text }, { paddingVertical: 0 }]}
                onChangeText={setName}
                disabled={isLoading}
                leftIcon={{ type: 'material', name: 'shopping-cart', color: '#1976d2' }}
                errorMessage={name.trim() ? '' : '交易方名称不能为空'}
              />

              <Input
                label="金额"
                placeholder="请输入金额"
                value={money}
                onChangeText={setMoney}
                keyboardType="numeric"
                disabled={isLoading}
                leftIcon={{ type: 'material', name: 'account-balance-wallet', color: '#1976d2' }}
                errorMessage={money && !isNaN(Number(money)) && Number(money) > 0 ? '' : '请输入有效的金额'}
                labelStyle={{ color: colors.text }}
                inputStyle={[{ fontSize: 14, lineHeight: 18, paddingVertical: 4, color: colors.text }, { paddingVertical: 0 }]}
              />

              <Text style={styles.label}>交易类型 (长按新增)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.typeContainer}>
                  {industryTypes.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeItem,
                        industryType === type && styles.selectedTypeItem,
                      ]}
                      onPress={() => setIndustryType(type)}
                      onLongPress={() => handleDoubleClick('industryType', type)}
                      delayLongPress={300}
                      disabled={isLoading}
                    >
                      <Text
                        style={[
                          styles.typeText,
                          industryType === type && styles.selectedTypeText,
                        ]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.label}>支付方式 (长按新增)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.typeContainer}>
                  {payTypes.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeItem,
                        payType === type && styles.selectedTypeItem,
                      ]}
                      onPress={() => setPayType(type)}
                      onLongPress={() => handleDoubleClick('payType', type)}
                      delayLongPress={300}
                      disabled={isLoading}
                    >
                      <Text
                        style={[
                          styles.typeText,
                          payType === type && styles.selectedTypeText,
                        ]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.label}>归属人 (长按新增)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.typeContainer}>
                  {attributions.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.typeItem,
                        attribution === item && styles.selectedTypeItem,
                      ]}
                      onPress={() => setAttribution(item)}
                      onLongPress={() => handleDoubleClick('attribution', item)}
                      delayLongPress={300}
                      disabled={isLoading}
                    >
                      <Text
                        style={[
                          styles.typeText,
                          attribution === item && styles.selectedTypeText,
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Divider style={styles.divider} />

              <Text style={styles.label}>交易日期</Text>
              <TouchableOpacity
                style={styles.dateContainer}
                onPress={() => setShowDatePicker(true)}
                disabled={isLoading}
              >
                <Text style={styles.dateText}>
                  {dayjs(flowDate).format('YYYY-MM-DD')}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={flowDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                  maximumDate={new Date()}
                />
              )}

              <Input
                label="备注（可选）"
                placeholder="请输入备注"
                value={description}
                onChangeText={setDescription}
                disabled={isLoading}
                leftIcon={{ type: 'material', name: 'description', color: '#1976d2' }}
                multiline
                numberOfLines={3}
                labelStyle={{ color: colors.text }}
                inputStyle={[{ fontSize: 14, textAlignVertical: 'top', paddingTop: 8, color: colors.text }, { paddingVertical: 0 }]}
              />

              {/* 小票上传区域 */}
              {renderInvoiceImages()}

              <View style={styles.buttonContainer}>
                <Button
                  title="取消"
                  type="outline"
                  containerStyle={styles.button}
                  onPress={() => navigation.goBack()}
                  disabled={isLoading}
                  titleStyle={{ color: colors.primary }}
                  buttonStyle={{ borderColor: colors.primary }}
                />

                <Button
                  title={isLoading ? '保存中...' : '保存'}
                  containerStyle={styles.button}
                  onPress={handleSave}
                  disabled={isLoading}
                  titleStyle={{ color: 'white' }}
                  buttonStyle={{ backgroundColor: colors.primary }}
                />
              </View>
            </Card>
          </ScrollView>

          {/* 小票图片查看器 */}
          {renderImageViewer()}

          {/* 编辑选项的 Overlay */}
          {renderEditOptionOverlay()}

          {/* 加载指示器 */}
          {(isLoading || uploadingImage) && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#1976d2" />
              <Text style={styles.loadingText}>
                {uploadingImage ? '上传中...' : '处理中...'}
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 10,
    borderRadius: 10,
    padding: 15,
  },
  buttonGroup: {
    marginBottom: 20,
    borderRadius: 5,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#86939e',
    marginLeft: 10,
    marginBottom: 10,
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  typeItem: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
    marginBottom: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  selectedTypeItem: {
    backgroundColor: '#1976d2',
  },
  typeText: {
    color: '#757575',
  },
  selectedTypeText: {
    color: 'white',
  },
  divider: {
    marginVertical: 15,
  },
  dateContainer: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginHorizontal: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#f0f0f0',
  },
  dateText: {
    fontSize: 16,
    color: '#1976d2',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    width: '48%',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invoiceContainer: {
    marginBottom: 20,
    marginTop: 10,
  },
  invoiceListContainer: {
    flexDirection: 'row',
    marginHorizontal: 10,
  },
  invoiceImageContainer: {
    marginRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  invoiceImage: {
    width: 80,
    height: 80,
  },
  addInvoiceButton: {
    width: 80,
    height: 80,
    borderWidth: 1,
    borderColor: '#1976d2',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
    marginRight: 10,
    backgroundColor: '#f0f7ff',
  },
  addButtonText: {
    fontSize: 12,
    color: '#1976d2',
    marginTop: 4,
  },
  uploadContainer: {
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  uploadInfoText: {
    color: '#757575',
    fontSize: 14,
  },
  imageViewerOverlay: {
    width: '90%',
    height: '70%',
    padding: 0,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  imageViewerContainer: {
    flex: 1,
    backgroundColor: 'white',
    position: 'relative',
  },
  fullImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  imageViewerButtons: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    padding: 15,
    zIndex: 100,
  },
  closeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 30,
    width: 50,
    height: 50,
  },
  deleteButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.7)',
    borderRadius: 30,
    width: 50,
    height: 50,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 10,
    color: '#1976d2',
    fontSize: 16,
  },
  invoiceImageWrapper: {
    width: 80,
    height: 80,
    backgroundColor: '#f9f9f9',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  localImageWrapper: {
    borderColor: '#ff9800',
    borderWidth: 2,
  },
  localImageBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#ff9800',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderBottomLeftRadius: 4,
  },
  localImageBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  thumbnailLoading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
  },
  imageLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  imageLoadingText: {
    marginTop: 10,
    color: '#1976d2',
    fontSize: 14,
  },
  editOptionOverlay: {
    width: '80%',
    borderRadius: 10,
    padding: 15,
  },
  editOptionContainer: {
    width: '100%',
  },
  editOptionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  editOptionInput: {
    marginBottom: 20,
  },
  editOptionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editOptionButton: {
    width: '48%',
  },
  offlineBanner: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    alignItems: 'center',
    marginBottom: 10,
    borderRadius: 5,
  },
  scrollContent: { flexGrow: 1, paddingBottom: 20 }, offlineBannerText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default FlowFormScreen;
