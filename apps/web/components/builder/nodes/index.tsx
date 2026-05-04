// Custom React Flow node registry. Each node type maps to a component that
// renders header + ports via BaseNode and contributes type-specific body content.

import type { NodeTypes } from '@xyflow/react';
import { PromptNode } from './PromptNode';
import { PromptListNode } from './PromptListNode';
import { UploadMediaNode } from './UploadMediaNode';
import { GeminiPromptNode } from './GeminiPromptNode';
import { GeminiPromptKieNode } from './GeminiPromptKieNode';
import { GeminiVisionNode } from './GeminiVisionNode';
import { GeminiChatNode } from './GeminiChatNode';
import { GenerateImageNode } from './GenerateImageNode';
import { GenerateVideoNode } from './GenerateVideoNode';
import { MergeVideoNode } from './MergeVideoNode';
import { RemoveLogoNode } from './RemoveLogoNode';
import { DownloadNode } from './DownloadNode';
import { FrameNode } from './FrameNode';

export const customNodeTypes: NodeTypes = {
  prompt: PromptNode,
  prompt_list: PromptListNode,
  upload_image: UploadMediaNode,
  gemini_prompt: GeminiPromptNode,
  gemini_prompt_kie: GeminiPromptKieNode,
  gemini_vision: GeminiVisionNode,
  gemini_chat: GeminiChatNode,
  generate_image: GenerateImageNode,
  generate_video: GenerateVideoNode,
  merge_video: MergeVideoNode,
  remove_logo: RemoveLogoNode,
  download: DownloadNode,
  frame: FrameNode,
};
