import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Button } from '@rneui/themed';
import dayjs from 'dayjs';

interface YearMonthPickerProps {
  value: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
  onClose: () => void;
  visible: boolean;
}

const YearMonthPicker: React.FC<YearMonthPickerProps> = ({ value, onChange, onClose, visible }) => {
  const [tempYear, setTempYear] = useState(value.year());
  const [tempMonth, setTempMonth] = useState(value.month());

  const handleConfirm = () => {
    onChange(dayjs().year(tempYear).month(tempMonth));
    onClose();
  };

  const handleCancel = () => {
    setTempYear(value.year());
    setTempMonth(value.month());
    onClose();
  };

  const changeYear = (delta: number) => {
    setTempYear(prev => prev + delta);
  };

  const changeMonth = (delta: number) => {
    let newMonth = tempMonth + delta;
    let newYear = tempYear;
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    setTempMonth(newMonth);
    setTempYear(newYear);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>选择年月</Text>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerColumn}>
              <TouchableOpacity onPress={() => changeYear(1)} style={styles.arrowButton}>
                <Text style={styles.arrowText}>▲</Text>
              </TouchableOpacity>
              <Text style={styles.valueText}>{tempYear}年</Text>
              <TouchableOpacity onPress={() => changeYear(-1)} style={styles.arrowButton}>
                <Text style={styles.arrowText}>▼</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerColumn}>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowButton}>
                <Text style={styles.arrowText}>▲</Text>
              </TouchableOpacity>
              <Text style={styles.valueText}>{tempMonth + 1}月</Text>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowButton}>
                <Text style={styles.arrowText}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.buttonContainer}>
            <Button
              title="取消"
              onPress={handleCancel}
              buttonStyle={styles.cancelButton}
              containerStyle={styles.buttonStyle}
            />
            <Button
              title="确定"
              onPress={handleConfirm}
              buttonStyle={styles.confirmButton}
              containerStyle={styles.buttonStyle}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  pickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  pickerColumn: {
    alignItems: 'center',
  },
  arrowButton: {
    padding: 10,
  },
  arrowText: {
    fontSize: 20,
  },
  valueText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonStyle: {
    width: '45%',
  },
  cancelButton: {
    backgroundColor: '#9e9e9e',
  },
  confirmButton: {
    backgroundColor: '#1976d2',
  },
});

export default YearMonthPicker;
