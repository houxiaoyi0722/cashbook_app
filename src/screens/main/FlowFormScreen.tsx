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

// todo 融合接口数据和固定数据后去重,固定数据交由设置页面编辑
const defaultPayTypes = ['现金', '支付宝', '微信', '银行卡', '信用卡', '其他'];

const FlowFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { currentFlow, date } = route.params || {};
  const { currentBook, remotePayType, remoteAttributions } = useBookkeeping();
  const {userInfo} = useAuth();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

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

  const [editingOption, setEditingOption] = useState<{
    type: 'industryType' | 'payType' | 'attribution';
    value: string;
  } | null>(null);
  const [newOptionValue, setNewOptionValue] = useState('');

  // 获取流水详情
  useEffect(() => {
    const fetchFlowDetail = async () => {

      let mergedPayTypes = defaultPayTypes;
      let mergedAttributions = [userInfo?.name!];
      let defaultIndustryType = defaultIndustryTypes[flowType];
      let apiResponse = await api.flow.industryType(currentBook?.bookId!,flowType);
      let merged = defaultIndustryTypes[flowType];

      if (currentFlow) {
        setName(currentFlow.name);
        setMoney(currentFlow.money.toString());
        setDescription(currentFlow.description || '');
        setFlowType(currentFlow.flowType);
        setIndustryType(currentFlow.industryType);
        setPayType(currentFlow.payType);
        setFlowDate(new Date(currentFlow.day));
        setAttribution(currentFlow.attribution || '');
        // 加载小票图片
        if (currentFlow.invoice) {
          const invoiceNames = currentFlow.invoice.split(',');
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

        if (currentFlow.payType) {
          mergedPayTypes = [...new Set([currentFlow.payType,...defaultPayTypes, ...remotePayType])];
        }

        if (currentFlow.attribution) {
          mergedAttributions = [...new Set([currentFlow.attribution,userInfo?.name!, ...remoteAttributions])];
        }
        if (currentFlow.industryType) {
          merged = [...new Set([currentFlow.industryType,...defaultIndustryType, ...apiResponse.d.map(item => item.industryType)])];
        }
      }
      if (!currentFlow || !currentFlow.payType) {
        mergedPayTypes = [...new Set([...defaultPayTypes, ...remotePayType])];
      }
      if (!currentFlow || !currentFlow.attribution) {
        mergedAttributions = [...new Set([userInfo?.name!, ...remoteAttributions])];
      }
      if (!currentFlow || !currentFlow.industryType) {
        merged = [...new Set([...defaultIndustryType, ...apiResponse.d.map(item => item.industryType)])];
      }
      setPayTypes(mergedPayTypes);
      setAttributions(mergedAttributions);
      setIndustryTypes(merged);
    };
    fetchFlowDetail();
  }, [currentFlow]);

  useEffect(() => {
    const flowTypeChange = async () => {
      let defaultIndustryType = defaultIndustryTypes[flowType];
      let apiResponse = await api.flow.industryType(currentBook?.bookId!,flowType);
      let merged;

      if (currentFlow && currentFlow.industryType) {
        merged = [...new Set([currentFlow.industryType,...defaultIndustryType, ...apiResponse.d.map(item => item.industryType)])];
      } else {
        merged = [...new Set([...defaultIndustryType, ...apiResponse.d.map(item => item.industryType)])];
      }
      setIndustryTypes(merged);
    };
    flowTypeChange();
  }, [flowType]);

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
        eventBus.emit('refreshCalendarFlows');
      } else {
        // 创建流水
        await api.flow.create({
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
        eventBus.emit('refreshCalendarFlows');
      }

      navigation.goBack();
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
    if (!currentFlow || !currentBook) {
      Alert.alert('提示', '请先保存流水后再上传小票');
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

  // 上传图片
  const uploadImage = async (image: ImagePicker.Asset) => {
    if (!currentFlow || !currentBook) {return;}

    try {
      setUploadingImage(true);
      const response = await api.flow.uploadInvoice(currentFlow.id, currentBook.bookId, image);

      if (response.c === 200) {
        // 刷新流水信息以获取更新后的小票列表
        const updatedFlowResponse = await api.flow.list({
          id: currentFlow.id,
          bookId: currentBook.bookId,
        });

        if (updatedFlowResponse.c === 200 && updatedFlowResponse.d.length > 0) {
          const updatedFlow = updatedFlowResponse.d.find(flow => flow.id === currentFlow.id);
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
      } else {
        Alert.alert('错误', response.m || '小票上传失败');
      }
    } catch (error) {
      console.error('小票上传失败', error);
      Alert.alert('错误', '小票上传失败');
    } finally {
      setUploadingImage(false);
    }
  };

  // 查看小票图片
  const viewInvoiceImage = (invoiceName: string) => {
    setSelectedImage(invoiceName);
    setShowImageViewer(true);

    // 尝试缓存当前查看的图片
    ImageCacheService.cacheImage(invoiceName);
  };

  // 删除小票图片
  const deleteInvoiceImage = async () => {
    if (!selectedImage || !currentFlow || !currentBook) {return;}

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
              const response = await api.flow.deleteInvoice(
                currentFlow.id,
                currentBook.bookId,
                selectedImage
              );

              if (response.c === 200) {
                // 从列表中移除已删除的图片
                const updatedImages = invoiceImages.filter(invoice => invoice !== selectedImage);
                setInvoiceImages(updatedImages);

                // 从缓存中清除图片
                await ImageCacheService.clearCache(selectedImage);

                setShowImageViewer(false);
                setSelectedImage(null);
              } else {
                Alert.alert('错误', response.m || '小票删除失败');
              }
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
            data={invoiceImages}
            horizontal
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.invoiceImageContainer}
                onPress={() => viewInvoiceImage(item)}
              >
                <View style={[styles.invoiceImageWrapper, { borderColor: colors.border }]}>
                  <Image
                    source={{
                      uri: ImageCacheService.getImageUrl(item),
                    }}
                    style={styles.invoiceImage}
                    resizeMode="cover"
                  />
                  {!ImageCacheService.isImageCached(item) && (
                    <ActivityIndicator
                      style={styles.thumbnailLoading}
                      size="small"
                      color={colors.primary}
                    />
                  )}
                </View>
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => `invoice-${item}-${index}`}
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
  const saveEditedOption = () => {
    if (!editingOption || !newOptionValue.trim()) {
      setEditingOption(null);
      return;
    }

    const { type, value } = editingOption;
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
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
              {currentFlow ? renderInvoiceImages() : (
                <View style={styles.uploadContainer}>
                  <Text style={styles.uploadInfoText}>保存流水后可上传小票图片</Text>
                </View>
              )}

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
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
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
});

export default FlowFormScreen;
