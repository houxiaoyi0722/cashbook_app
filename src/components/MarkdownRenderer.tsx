import React from 'react';
import { 
  View, 
  StyleSheet, 
  TextStyle, 
  ViewStyle, 
  useColorScheme,
  Platform 
} from 'react-native';
import MarkdownDisplay, { MarkdownIt } from 'react-native-markdown-display';
import { getColors } from '../context/ThemeContext';

export interface MarkdownRendererProps {
  /** The markdown content to render */
  content: string;
  /** Custom styles for the container */
  containerStyle?: ViewStyle;
  /** Custom styles for the markdown text */
  textStyle?: TextStyle | TextStyle[];
  /** Whether to use dark mode (if not provided, uses system color scheme) */
  isDarkMode?: boolean;
  /** Maximum width for images and other elements */
  maxWidth?: number;
  /** Whether to parse the markdown with additional rules */
  useExtendedMarkdown?: boolean;
}

/**
 * A reusable component for rendering markdown content in React Native.
 * Supports dark/light mode theming and basic markdown features.
 */
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  containerStyle,
  textStyle,
  isDarkMode,
  maxWidth = 300,
  useExtendedMarkdown = true,
}) => {
  // Determine color scheme
  const systemColorScheme = useColorScheme();
  const actualDarkMode = isDarkMode ?? (systemColorScheme === 'dark');
  const colors = getColors(actualDarkMode);

  // Create markdown parser with optional extensions
  const markdownParser = useExtendedMarkdown 
    ? MarkdownIt({ typographer: true, linkify: true })
    : MarkdownIt();

  // Define markdown styles that adapt to theme
  const markdownStyles = StyleSheet.create({
    // Root container
    root: {
      backgroundColor: 'transparent',
    },
    // Text elements
    body: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
    },
    // Headers
    heading1: {
      color: colors.text,
      fontSize: 24,
      fontWeight: 'bold' as const,
      marginTop: 20,
      marginBottom: 10,
      lineHeight: 32,
    },
    heading2: {
      color: colors.text,
      fontSize: 20,
      fontWeight: 'bold' as const,
      marginTop: 18,
      marginBottom: 8,
      lineHeight: 28,
    },
    heading3: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600' as const,
      marginTop: 16,
      marginBottom: 6,
      lineHeight: 26,
    },
    heading4: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600' as const,
      marginTop: 14,
      marginBottom: 6,
      lineHeight: 24,
    },
    heading5: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600' as const,
      marginTop: 12,
      marginBottom: 6,
      lineHeight: 22,
    },
    heading6: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600' as const,
      marginTop: 10,
      marginBottom: 6,
      lineHeight: 20,
    },
    // Text formatting
    strong: {
      color: colors.text,
      fontWeight: 'bold' as const,
    },
    em: {
      color: colors.text,
      fontStyle: 'italic' as const,
    },
    s: {
      color: colors.text,
      textDecorationLine: 'line-through' as const,
    },
    // Links
    link: {
      color: colors.primary,
      textDecorationLine: 'underline' as const,
    },
    // Lists
    bullet_list: {
      marginTop: 6,
      marginBottom: 6,
    },
    ordered_list: {
      marginTop: 6,
      marginBottom: 6,
    },
    list_item: {
      flexDirection: 'row' as const,
      marginBottom: 4,
    },
    bullet_list_icon: {
      marginLeft: 10,
      marginRight: 10,
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
    },
    ordered_list_icon: {
      marginLeft: 10,
      marginRight: 10,
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
    },
    // Code blocks
    code_inline: {
      color: colors.text,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
    },
    code_block: {
      color: colors.text,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      padding: 12,
      marginVertical: 8,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
    },
    fence: {
      color: colors.text,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      padding: 12,
      marginVertical: 8,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
    },
    // Blockquotes
    blockquote: {
      backgroundColor: colors.card,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      paddingLeft: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },
    // Horizontal rule
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 16,
    },
    // Tables
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      marginVertical: 8,
    },
    thead: {
      backgroundColor: colors.card,
    },
    tbody: {
      backgroundColor: colors.background,
    },
    th: {
      color: colors.text,
      fontWeight: 'bold' as const,
      padding: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tr: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    td: {
      color: colors.text,
      padding: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    // Images
    image: {
      maxWidth: maxWidth,
      height: 200,
      resizeMode: 'contain' as const,
      borderRadius: 8,
      marginVertical: 8,
    },
    // Paragraphs
    paragraph: {
      marginTop: 8,
      marginBottom: 8,
    },
    // Inline elements
    text: {
      color: colors.text,
    },
    textgroup: {
      color: colors.text,
    },
    // Spans
    span: {
      color: colors.text,
    },
  });

  // Merge custom styles with default styles
  const mergedStyles = {
    ...markdownStyles,
    body: StyleSheet.flatten([
      markdownStyles.body,
      textStyle,
    ]),
  };

  // Rules for custom markdown processing
  const rules = {
    // You can add custom rules here if needed
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <MarkdownDisplay
        style={mergedStyles}
        rules={rules}
        markdownit={markdownParser}
      >
        {content}
      </MarkdownDisplay>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default MarkdownRenderer;
