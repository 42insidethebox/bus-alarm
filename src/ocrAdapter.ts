import { recognizeScheduleHeading, TimetableOcrInput } from "./ocrParser";
import { OcrRecognition } from "./ocrService";
export function recognitionToParserInput(
  recognition: OcrRecognition,
): TimetableOcrInput {
  const tokens = recognition.blocks
    .flatMap((block) =>
      block.lines.flatMap((line) =>
        recognizeScheduleHeading(line.text)
          ? [line]
          : line.elements.length
            ? line.elements
            : [line],
      ),
    )
    .map((item) => ({ text: item.text, boundingBox: item.boundingBox }));
  return {
    rawText: recognition.text,
    tokens,
    blocks: recognition.blocks.map((block) => ({
      text: block.text,
      boundingBox: block.boundingBox,
    })),
  };
}
