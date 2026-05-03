import fs from "node:fs";

const paths = [
  new URL("../src/shell/locales/en/common.json", import.meta.url),
  new URL("../src/shell/locales/zh-CN/common.json", import.meta.url),
];

for (const fileUrl of paths) {
  let s = fs.readFileSync(fileUrl, "utf8");
  s = s.split("Paperclip").join("OneEarning");
  s = s.replaceAll('"requiredByOneEarning"', '"requiredByPaperclip"');
  s = s.replaceAll('"sourceManagedOneEarning"', '"sourceManagedPaperclip"');
  s = s.replaceAll('"sourceFallbackOneEarning"', '"sourceFallbackPaperclip"');
  fs.writeFileSync(fileUrl, s);
}
console.log("locale Paperclip -> OneEarning (keys preserved)");
