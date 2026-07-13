import { describe, expect, it } from "vitest";
import { recognitionToParserInput } from "./ocrAdapter";
import { parseTimetableOcr } from "./ocrParser";
describe("OCR adapter", () =>
  it("retains a multiword Italian heading and positioned elements", () => {
    const input = recognitionToParserInput({
      text: "Lunedì al venerdì\n06:42",
      blocks: [
        {
          text: "Lunedì al venerdì\n06:42",
          boundingBox: { x: 0, y: 0, width: 120, height: 80 },
          lines: [
            {
              text: "Lunedì al venerdì",
              boundingBox: { x: 0, y: 0, width: 120, height: 20 },
              elements: [
                {
                  text: "Lunedì",
                  boundingBox: { x: 0, y: 0, width: 40, height: 20 },
                },
                {
                  text: "al",
                  boundingBox: { x: 45, y: 0, width: 10, height: 20 },
                },
                {
                  text: "venerdì",
                  boundingBox: { x: 60, y: 0, width: 50, height: 20 },
                },
              ],
            },
            {
              text: "06:42",
              boundingBox: { x: 0, y: 40, width: 50, height: 20 },
              elements: [
                {
                  text: "06:42",
                  boundingBox: { x: 0, y: 40, width: 50, height: 20 },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(parseTimetableOcr(input).groups[0]).toMatchObject({
      days: [1, 2, 3, 4, 5],
    });
  }));
