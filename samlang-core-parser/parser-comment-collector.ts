import { CharStreams } from 'antlr4ts';

import { tokenRange } from './parser-util';

import type { Range } from 'samlang-core-ast/common-nodes';
import { PLLexer } from 'samlang-core-parser-generated/PLLexer';
import { checkNotNull, isNotNull } from 'samlang-core-utils';

const HIDDEN_CHANNEL_ID = 1;

export type CommentTokenWithRange = {
  readonly commentType: 'doc' | 'block' | 'line';
  readonly commentText: string;
  readonly range: Range;
};

export const postProcessBlockComment = (blockComment: string): string =>
  blockComment
    .split('\n')
    .map((line) => line.trimStart())
    .map((line) => (line.startsWith('*') ? line.substring(1).trim() : line.trimEnd()))
    .filter((line) => line.length > 0)
    .join(' ');

export const collectCommentsForParser = (text: string): readonly CommentTokenWithRange[] =>
  new PLLexer(CharStreams.fromString(text))
    .getAllTokens()
    .map((token) => {
      if (token.channel !== HIDDEN_CHANNEL_ID) return null;
      const rawText = token.text;
      // istanbul ignore next
      if (rawText == null) return null;
      const range = tokenRange(token);
      let commentType: 'doc' | 'block' | 'line';
      let commentText: string;
      if (rawText.startsWith('//')) {
        commentType = 'line';
        commentText = rawText.substring(2).trim();
      } else if (rawText.startsWith('/**') && rawText.endsWith('*/')) {
        commentType = 'doc';
        commentText = postProcessBlockComment(rawText.substring(3, rawText.length - 2));
      } else if (rawText.startsWith('/*') && rawText.endsWith('*/')) {
        commentType = 'block';
        commentText = postProcessBlockComment(rawText.substring(3, rawText.length - 2));
      } else {
        return null;
      }
      return { commentType, commentText, range };
    })
    .filter(isNotNull);

export const findRelevantDocComment = (
  commentTokens: readonly CommentTokenWithRange[],
  searchRange: Range
): string | null => {
  for (let i = commentTokens.length - 1; i >= 0; i -= 1) {
    const token = checkNotNull(commentTokens[i]);
    if (token.commentType === 'doc' && searchRange.containsRange(token.range)) {
      return token.commentText;
    }
  }
  return null;
};
