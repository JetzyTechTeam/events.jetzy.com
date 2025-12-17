declare module 'emoji-picker-react' {
  import { Component } from 'react';
  
  export interface EmojiClickData {
    emoji: string;
    unified: string;
  }
  
  export interface EmojiPickerProps {
    onEmojiClick: (data: EmojiClickData) => void;
    pickerStyle?: React.CSSProperties;
    width?: number | string;
    height?: number | string;
    previewConfig?: {
      defaultCaption?: string;
      showPreview?: boolean;
    };
    skinTonesDisabled?: boolean;
    searchDisabled?: boolean;
    skinTonePickerLocation?: 'preview' | 'search' | 'top';
    defaultSkinTone?: string;
    theme?: 'light' | 'dark' | 'auto';
  }
  
  const EmojiPicker: React.FC<EmojiPickerProps>;
  export default EmojiPicker;
}

