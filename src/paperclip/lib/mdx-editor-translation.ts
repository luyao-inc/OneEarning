import type { TFunction } from "i18next";

/**
 * @mdxeditor/editor 使用 `(key, defaultValue, interpolations?) => string`；
 * 映射到 `common.json` 中 `paperclip.mdxEditor.*`。
 */
const MDX_EDITOR_I18N_KEYS: Record<string, string> = {
  "uploadImage.dialogTitle": "paperclip.mdxEditor.uploadImage.dialogTitle",
  "uploadImage.uploadInstructions": "paperclip.mdxEditor.uploadImage.uploadInstructions",
  "uploadImage.addViaUrlInstructions": "paperclip.mdxEditor.uploadImage.addViaUrlInstructions",
  "uploadImage.addViaUrlInstructionsNoUpload": "paperclip.mdxEditor.uploadImage.addViaUrlInstructionsNoUpload",
  "uploadImage.autoCompletePlaceholder": "paperclip.mdxEditor.uploadImage.autoCompletePlaceholder",
  "uploadImage.alt": "paperclip.mdxEditor.uploadImage.alt",
  "uploadImage.title": "paperclip.mdxEditor.uploadImage.title",
  "uploadImage.width": "paperclip.mdxEditor.uploadImage.width",
  "uploadImage.height": "paperclip.mdxEditor.uploadImage.height",
  "dialogControls.save": "paperclip.mdxEditor.dialogControls.save",
  "dialogControls.cancel": "paperclip.mdxEditor.dialogControls.cancel",
  "contentArea.editableMarkdown": "paperclip.mdxEditor.contentArea.editableMarkdown",
  "createLink.url": "paperclip.mdxEditor.createLink.url",
  "createLink.urlPlaceholder": "paperclip.mdxEditor.createLink.urlPlaceholder",
  "createLink.textTooltip": "paperclip.mdxEditor.createLink.textTooltip",
  "createLink.text": "paperclip.mdxEditor.createLink.text",
  "createLink.titleTooltip": "paperclip.mdxEditor.createLink.titleTooltip",
  "createLink.title": "paperclip.mdxEditor.createLink.title",
  "createLink.saveTooltip": "paperclip.mdxEditor.createLink.saveTooltip",
  "createLink.cancelTooltip": "paperclip.mdxEditor.createLink.cancelTooltip",
  "linkPreview.open": "paperclip.mdxEditor.linkPreview.open",
  "linkPreview.edit": "paperclip.mdxEditor.linkPreview.edit",
  "linkPreview.copyToClipboard": "paperclip.mdxEditor.linkPreview.copyToClipboard",
  "linkPreview.copied": "paperclip.mdxEditor.linkPreview.copied",
  "linkPreview.remove": "paperclip.mdxEditor.linkPreview.remove",
};

export function createMdxEditorTranslation(
  t: TFunction,
): (key: string, defaultValue: string, interpolations?: Record<string, unknown>) => string {
  return (key, defaultValue, interpolations = {}) => {
    const mapped = MDX_EDITOR_I18N_KEYS[key];
    if (mapped) {
      return String(t(mapped, { ...interpolations, defaultValue }));
    }
    let value = defaultValue;
    for (const [k, v] of Object.entries(interpolations)) {
      value = value.replaceAll(`{{${k}}}`, String(v));
    }
    return value;
  };
}
