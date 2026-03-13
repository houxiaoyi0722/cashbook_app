import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from '@rneui/themed';
import { Overlay } from '@rneui/themed';

interface ImageSourceSelectorProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  onTakePhoto: () => void;
  onSelectFromLibrary: () => void;
  colors: {
    dialog: string;
    text: string;
    secondaryText: string;
    card: string;
    primary: string;
    input: string;
  };
}

const ImageSourceSelector: React.FC<ImageSourceSelectorProps> = ({
  visible,
  onClose,
  title,
  onTakePhoto,
  onSelectFromLibrary,
  colors,
}) => {
  return (
    <Overlay
      isVisible={visible}
      onBackdropPress={onClose}
      overlayStyle={[styles.overlay, { backgroundColor: colors.dialog }]}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Icon iconProps={{ name: "close", type: "material", size: 24, color: colors.text }} />
          </TouchableOpacity>
        </View>

        <View style={styles.buttons}>
          {/* 拍照按钮 */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.card }]}
            onPress={onTakePhoto}
          >
            <Icon iconProps={{ name: "camera-alt", type: "material", size: 32, color: colors.primary }} />
            <Text style={[styles.buttonText, { color: colors.text }]}>拍照</Text>
          </TouchableOpacity>

          {/* 从相册选择按钮 */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.card }]}
            onPress={onSelectFromLibrary}
          >
            <Icon iconProps={{ name: "photo-library", type: "material", size: 32, color: colors.primary }} />
            <Text style={[styles.buttonText, { color: colors.text }]}>从相册选择</Text>
          </TouchableOpacity>
        </View>

        {/* 取消按钮 */}
        <TouchableOpacity
          style={[styles.cancelButton, { backgroundColor: colors.input }]}
          onPress={onClose}
        >
          <Text style={[styles.cancelButtonText, { color: colors.text }]}>取消</Text>
        </TouchableOpacity>
      </View>
    </Overlay>
  );
};

const styles = StyleSheet.create({
  overlay: {
    width: '80%',
    borderRadius: 10,
    padding: 0,
    overflow: 'hidden',
  },
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 14,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 10,
    width: 120,
    height: 80,
  },
  buttonText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  cancelButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ImageSourceSelector;
