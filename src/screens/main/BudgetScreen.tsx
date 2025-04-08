import React, {useState, useEffect} from 'react';
import {View, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity} from 'react-native';
import {Card, Button, Text, Input, Icon, Divider, ListItem, Overlay} from '@rneui/themed';
import api from '../../services/api';
import {Budget, FixedFlow} from '../../types';
import dayjs from 'dayjs';
import {useBookkeeping} from '../../context/BookkeepingContext';
import BookSelector from '../../components/BookSelector.tsx';

const BudgetScreen = () => {
    // 基础状态
    const {currentBook} = useBookkeeping();
    const [loading, setLoading] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'));
    const [showBudgetModal, setShowBudgetModal] = useState(false);
    const [newBudget, setNewBudget] = useState('');

    // 预算状态
    const [budget, setBudget] = useState<Budget | null>(null);

    // 固定支出状态
    const [fixedFlows, setFixedFlows] = useState<FixedFlow[]>([]);
    const [fixedFlowModalVisible, setFixedFlowModalVisible] = useState(false);
    const [selectedFixedFlow, setSelectedFixedFlow] = useState<FixedFlow | null>(null);

    // 新增/编辑固定支出状态
    const [ffName, setFfName] = useState('');
    const [ffAmount, setFfAmount] = useState('');
    const [ffAttribution, setFfAttribution] = useState('');
    const [ffStartMonth, setFfStartMonth] = useState(dayjs().format('YYYY-MM'));
    const [ffEndMonth, setFfEndMonth] = useState(dayjs().add(5, 'month').format('YYYY-MM'));

    // 加载数据
    const loadData = async () => {
        if (!currentBook) {return;}
        setLoading(true);
        try {
            // 加载预算
            const budgetResponse = await api.budget.list(currentBook.bookId, currentMonth);
            if (budgetResponse.c === 200 && budgetResponse.d && budgetResponse.d.length > 0) {
                setBudget(budgetResponse.d[0]);
            } else {
                setBudget(null);
            }

            // 加载固定支出
            const fixedFlowResponse = await api.fixedFlow.list(currentBook.bookId, currentMonth);
            if (fixedFlowResponse.c === 200) {
                setFixedFlows(fixedFlowResponse.d || []);
            }
        } catch (error) {
            console.error('加载数据失败:', error);
            Alert.alert('错误', '加载数据失败');
        } finally {
            setLoading(false);
        }
    };

    // 刷新已用额度
    const refreshUsedAmount = async () => {
        if (!currentBook) {return;}
        try {
            await api.budget.reloadUsedAmount(currentBook.bookId, currentMonth);
            await loadData();
        } catch (error) {
            console.error('刷新已用额度失败:', error);
            Alert.alert('错误', '刷新已用额度失败');
        }
    };

    // 保存预算
    const handleSaveBudget = async () => {
        if (!currentBook) {return;}
        if (!newBudget || isNaN(Number(newBudget))) {
            Alert.alert('错误', '请输入有效的预算金额');
            return;
        }

        setLoading(true);
        try {
            const budgetData = {
                bookId: currentBook.bookId,
                month: currentMonth,
                budget: Number(newBudget),
                id: budget?.id,
            };

            const response = await api.budget.update(budgetData);
            if (response.c === 200) {
                Alert.alert('成功', '预算保存成功');
                await loadData();
                setShowBudgetModal(false);
            } else {
                Alert.alert('错误', response.m || '保存失败');
            }
        } catch (error) {
            console.error('保存预算失败:', error);
            Alert.alert('错误', '保存预算失败');
        } finally {
            setLoading(false);
        }
    };

    // 打开预算编辑模态框
    const openBudgetModal = () => {
        setNewBudget(budget?.budget ? budget.budget.toString() : '');
        setShowBudgetModal(true);
    };

    // 新增/编辑固定支出
    const handleSaveFixedFlow = async () => {
        if (!currentBook) {return;}
        if (!ffName.trim()) {
            Alert.alert('错误', '请输入支出名称');
            return;
        }
        if (!ffAmount || isNaN(Number(ffAmount))) {
            Alert.alert('错误', '请输入有效的支出金额');
            return;
        }
        if (!ffAttribution.trim()) {
            Alert.alert('错误', '请输入归属人');
            return;
        }

        setLoading(true);
        try {
            if (selectedFixedFlow) {
                // 更新固定支出
                const updateData = {
                    ...selectedFixedFlow,
                    name: ffName.trim(),
                    money: Number(ffAmount),
                    attribution: ffAttribution.trim(),
                    startMonth: ffStartMonth,
                    endMonth: ffEndMonth,
                };

                const response = await api.fixedFlow.update(updateData);
                if (response.c === 200) {
                    Alert.alert('成功', '固定支出更新成功');
                    setFixedFlowModalVisible(false);
                    await loadData();
                } else {
                    Alert.alert('错误', response.m || '更新失败');
                }
            } else {
                // 新增固定支出
                const newData = {
                    bookId: currentBook.bookId,
                    month: currentMonth,
                    startMonth: ffStartMonth,
                    endMonth: ffEndMonth,
                    name: ffName.trim(),
                    money: Number(ffAmount),
                    attribution: ffAttribution.trim(),
                };

                const response = await api.fixedFlow.add(newData);
                if (response.c === 200) {
                    Alert.alert('成功', '固定支出添加成功');
                    setFixedFlowModalVisible(false);
                    await loadData();
                } else {
                    Alert.alert('错误', response.m || '添加失败');
                }
            }
        } catch (error) {
            console.error('保存固定支出失败:', error);
            Alert.alert('错误', '保存固定支出失败');
        } finally {
            setLoading(false);
        }
    };

    // 删除固定支出
    const handleDeleteFixedFlow = async (item: FixedFlow) => {
        if (!currentBook) {return;}

        Alert.alert(
            '确认删除',
            `确定要删除固定支出 "${item.name}" 吗？`,
            [
                {
                    text: '取消',
                    style: 'cancel',
                },
                {
                    text: '删除',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const response = await api.fixedFlow.delete(item.id!, currentBook.bookId);
                            if (response.c === 200) {
                                Alert.alert('成功', '固定支出删除成功');
                                await loadData();
                            } else {
                                Alert.alert('错误', response.m || '删除失败');
                            }
                        } catch (error) {
                            console.error('删除固定支出失败:', error);
                            Alert.alert('错误', '删除固定支出失败');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    };

    // 打开新增固定支出模态框
    const openAddFixedFlowModal = () => {
        setSelectedFixedFlow(null);
        setFfName('');
        setFfAmount('');
        setFfAttribution('');
        setFfStartMonth(dayjs().format('YYYY-MM'));
        setFfEndMonth(dayjs().add(5, 'month').format('YYYY-MM'));
        setFixedFlowModalVisible(true);
    };

    // 打开编辑固定支出模态框
    const openEditFixedFlowModal = (item: FixedFlow) => {
        setSelectedFixedFlow(item);
        setFfName(item.name);
        setFfAmount(item.money? item.money.toString() : '0');
        setFfAttribution(item.attribution);
        // 假设已存在的固定支出没有开始和结束月份，使用当前月和未来5个月
        setFfStartMonth(dayjs().format('YYYY-MM'));
        setFfEndMonth(dayjs().add(5, 'month').format('YYYY-MM'));
        setFixedFlowModalVisible(true);
    };

    // 初始加载数据
    useEffect(() => {
        if (currentBook) {
            loadData();
        }
    }, [currentBook, currentMonth]);

    // 计算预算使用百分比
    const usedPercentage = budget ? Math.min(100, Math.round((budget.used / budget.budget) * 100)) : 0;
    const usedPercentageColor = usedPercentage < 70 ? '#4caf50' : usedPercentage < 90 ? '#ff9800' : '#f44336';

    // 计算固定支出总额
    const totalFixedExpense = fixedFlows.reduce((sum, item) => sum + item.money, 0);

    return (
        <View style={styles.container}>
            <BookSelector/>
            <ScrollView style={styles.container}>

                {/* 月份选择器 */}
                <View style={styles.monthSelector}>
                    <TouchableOpacity
                        onPress={() => setCurrentMonth(dayjs(currentMonth).subtract(1, 'month').format('YYYY-MM'))}
                        style={styles.monthButton}
                    >
                        <Icon name="chevron-left" type="material" color="#1976d2"/>
                    </TouchableOpacity>

                    <Text style={styles.monthText}>{currentMonth}</Text>

                    <TouchableOpacity
                        onPress={() => setCurrentMonth(dayjs(currentMonth).add(1, 'month').format('YYYY-MM'))}
                        style={styles.monthButton}
                    >
                        <Icon name="chevron-right" type="material" color="#1976d2"/>
                    </TouchableOpacity>
                </View>

                {/* 预算卡片 */}
                <Card containerStyle={styles.card}>
                    <View style={styles.cardTitleContainer}>
                        <Card.Title style={styles.cardTitle}>
                            <Icon name="account-balance-wallet" type="material" color="#1976d2" size={20}/>
                            <Text style={styles.titleText}> 预算管理</Text>
                        </Card.Title>
                        <TouchableOpacity onPress={openBudgetModal}>
                            <Icon name="edit" type="material" color="#1976d2" size={24}/>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.budgetInfoContainer}>
                        <View style={styles.budgetInfo}>
                            <Text style={styles.budgetLabel}>预算金额</Text>
                            <Text style={styles.budgetValue}>¥ {budget?.budget?.toFixed(2) || '0.00'}</Text>
                        </View>

                        <View style={styles.budgetInfo}>
                            <Text style={styles.budgetLabel}>已使用</Text>
                            <Text
                                style={[styles.budgetValue, {color: '#f44336'}]}>¥ {budget?.used?.toFixed(2) || '0.00'}</Text>
                        </View>

                        <View style={styles.budgetInfo}>
                            <Text style={styles.budgetLabel}>剩余预算</Text>
                            <Text style={[styles.budgetValue, {color: '#4caf50'}]}>
                                ¥ {budget ? (budget.budget - budget.used).toFixed(2) : '0.00'}
                            </Text>
                        </View>
                    </View>

                    {/* 预算进度条 */}
                    <View style={styles.progressContainer}>
                        <View style={styles.progressBar}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {width: `${usedPercentage}%`, backgroundColor: usedPercentageColor},
                                ]}
                            />
                        </View>
                        <Text style={styles.progressText}>{usedPercentage}%</Text>
                    </View>

                    <Divider style={styles.divider}/>

                    <Button
                        title="刷新额度"
                        onPress={refreshUsedAmount}
                        loading={loading}
                        buttonStyle={[styles.button, styles.refreshButton]}
                        containerStyle={styles.buttonWrapper}
                        icon={
                            <Icon
                                name="refresh"
                                type="material"
                                color="white"
                                size={16}
                                style={{marginRight: 8}}
                            />
                        }
                    />
                </Card>

                {/* 固定支出卡片 */}
                <Card containerStyle={styles.card}>
                    <View style={styles.cardTitleContainer}>
                        <Card.Title style={styles.cardTitle}>
                            <Icon name="repeat" type="material" color="#1976d2" size={20}/>
                            <Text style={styles.titleText}> 固定支出管理</Text>
                        </Card.Title>
                        <TouchableOpacity onPress={openAddFixedFlowModal}>
                            <Icon name="add" type="material" color="#1976d2" size={24}/>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.fixedExpenseSummary}>
                        <Text style={styles.fixedExpenseTitle}>固定支出总额</Text>
                        <Text style={styles.fixedExpenseAmount}>¥ {totalFixedExpense.toFixed(2)}</Text>
                    </View>

                    <Divider style={styles.divider}/>

                    {/* 固定支出列表 */}
                    {fixedFlows.length > 0 ? (
                        <View style={styles.fixedFlowList}>
                            {fixedFlows.map((item, index) => (
                                <ListItem key={item.id || index} bottomDivider>
                                    <ListItem.Content>
                                        <ListItem.Title style={styles.fixedFlowTitle}>{item.name}</ListItem.Title>
                                        <ListItem.Subtitle>归属人: {item.attribution}</ListItem.Subtitle>
                                    </ListItem.Content>
                                    <Text style={styles.fixedFlowAmount}>¥ {item.money.toFixed(2)}</Text>
                                    <View style={styles.fixedFlowActions}>
                                        <TouchableOpacity onPress={() => openEditFixedFlowModal(item)}
                                                          style={styles.actionButton}>
                                            <Icon name="edit" type="material" size={20} color="#1976d2"/>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDeleteFixedFlow(item)}
                                                          style={styles.actionButton}>
                                            <Icon name="delete" type="material" size={20} color="#f44336"/>
                                        </TouchableOpacity>
                                    </View>
                                </ListItem>
                            ))}
                        </View>
                    ) : (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>暂无固定支出</Text>
                        </View>
                    )}

                </Card>

                {/* 预算编辑模态框 */}
                <Overlay
                    isVisible={showBudgetModal}
                    onBackdropPress={() => setShowBudgetModal(false)}
                    overlayStyle={styles.overlay}
                >
                    <View>
                        <Text style={styles.overlayTitle}>设置预算</Text>
                        <Input
                            label="预算金额"
                            placeholder="请输入预算金额"
                            value={newBudget}
                            onChangeText={setNewBudget}
                            keyboardType="numeric"
                            leftIcon={
                                <Icon
                                    type="material"
                                    name="attach-money"
                                    size={24}
                                    color="#1976d2"
                                />
                            }
                        />
                        <View style={styles.overlayButtons}>
                            <Button
                                title="取消"
                                onPress={() => setShowBudgetModal(false)}
                                buttonStyle={styles.cancelButton}
                                containerStyle={styles.overlayButtonContainer}
                            />
                            <Button
                                title="保存"
                                onPress={handleSaveBudget}
                                loading={loading}
                                buttonStyle={styles.saveButton}
                                containerStyle={styles.overlayButtonContainer}
                            />
                        </View>
                    </View>
                </Overlay>

                {/* 固定支出编辑模态框 */}
                <Overlay
                    isVisible={fixedFlowModalVisible}
                    onBackdropPress={() => setFixedFlowModalVisible(false)}
                    overlayStyle={styles.overlay}
                >
                    <View>
                        <Text style={styles.overlayTitle}>
                            {selectedFixedFlow ? '编辑固定支出' : '添加固定支出'}
                        </Text>

                        <Input
                            label="支出名称"
                            placeholder="请输入支出名称"
                            value={ffName}
                            onChangeText={setFfName}
                            leftIcon={
                                <Icon
                                    type="material"
                                    name="label"
                                    size={24}
                                    color="#1976d2"
                                />
                            }
                        />

                        <Input
                            label="支出金额"
                            placeholder="请输入支出金额"
                            value={ffAmount}
                            onChangeText={setFfAmount}
                            keyboardType="numeric"
                            leftIcon={
                                <Icon
                                    type="material"
                                    name="attach-money"
                                    size={24}
                                    color="#1976d2"
                                />
                            }
                        />

                        <Input
                            label="归属人"
                            placeholder="请输入归属人"
                            value={ffAttribution}
                            onChangeText={setFfAttribution}
                            leftIcon={
                                <Icon
                                    type="material"
                                    name="person"
                                    size={24}
                                    color="#1976d2"
                                />
                            }
                        />

                        <View style={styles.dateRangeContainer}>
                            <View style={styles.dateField}>
                                <Text style={styles.dateLabel}>开始月份</Text>
                                <Input
                                    value={ffStartMonth}
                                    onChangeText={setFfStartMonth}
                                    placeholder="YYYY-MM"
                                    leftIcon={
                                        <Icon
                                            type="material"
                                            name="date-range"
                                            size={24}
                                            color="#1976d2"
                                        />
                                    }
                                />
                            </View>

                            <View style={styles.dateField}>
                                <Text style={styles.dateLabel}>结束月份</Text>
                                <Input
                                    value={ffEndMonth}
                                    onChangeText={setFfEndMonth}
                                    placeholder="YYYY-MM"
                                    leftIcon={
                                        <Icon
                                            type="material"
                                            name="date-range"
                                            size={24}
                                            color="#1976d2"
                                        />
                                    }
                                />
                            </View>
                        </View>

                        <View style={styles.overlayButtons}>
                            <Button
                                title="取消"
                                onPress={() => setFixedFlowModalVisible(false)}
                                buttonStyle={styles.cancelButton}
                                containerStyle={styles.overlayButtonContainer}
                            />
                            <Button
                                title="保存"
                                onPress={handleSaveFixedFlow}
                                loading={loading}
                                buttonStyle={styles.saveButton}
                                containerStyle={styles.overlayButtonContainer}
                            />
                        </View>
                    </View>
                </Overlay>

                {/* 加载指示器 */}
                {loading && !fixedFlowModalVisible && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#1976d2"/>
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    cardTitleContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    monthSelector: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    monthButton: {
        padding: 8,
    },
    monthText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1976d2',
        marginHorizontal: 16,
    },
    card: {
        borderRadius: 8,
        marginBottom: 16,
        padding: 16,
        elevation: 4,
    },
    cardTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    titleText: {
        fontSize: 18,
        color: '#1976d2',
        fontWeight: 'bold',
    },
    budgetInfoContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    budgetInfo: {
        flex: 1,
        alignItems: 'center',
    },
    budgetLabel: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    budgetValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    progressContainer: {
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressBar: {
        flex: 1,
        height: 12,
        backgroundColor: '#e0e0e0',
        borderRadius: 6,
        overflow: 'hidden',
        marginRight: 8,
    },
    progressFill: {
        height: '100%',
        borderRadius: 6,
    },
    progressText: {
        width: 48,
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'right',
    },
    divider: {
        marginVertical: 16,
    },
    budgetForm: {
        marginBottom: 8,
    },
    input: {
        marginBottom: 8,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    buttonWrapper: {
        flex: 1,
        marginHorizontal: 4,
    },
    button: {
        borderRadius: 8,
    },
    saveButton: {
        backgroundColor: '#1976d2',
    },
    refreshButton: {
        backgroundColor: '#4caf50',
    },
    addButton: {
        backgroundColor: '#1976d2',
        borderRadius: 8,
        marginTop: 8,
    },
    fixedExpenseSummary: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    fixedExpenseTitle: {
        fontSize: 16,
        color: '#333',
    },
    fixedExpenseAmount: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#f44336',
    },
    fixedFlowList: {
        marginBottom: 16,
    },
    fixedFlowTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    fixedFlowAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f44336',
        marginRight: 8,
    },
    fixedFlowActions: {
        flexDirection: 'row',
    },
    actionButton: {
        padding: 6,
        marginLeft: 4,
    },
    emptyContainer: {
        padding: 24,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
    overlay: {
        width: '90%',
        borderRadius: 8,
        padding: 16,
    },
    overlayTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1976d2',
        marginBottom: 16,
        textAlign: 'center',
    },
    dateRangeContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    dateField: {
        flex: 1,
        marginHorizontal: 4,
    },
    dateLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#86939e',
        marginLeft: 10,
    },
    overlayButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 16,
    },
    overlayButtonContainer: {
        flex: 1,
        marginHorizontal: 4,
    },
    cancelButton: {
        backgroundColor: '#9e9e9e',
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
});

export default BudgetScreen;
