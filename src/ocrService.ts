import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import type { RecognitionResult } from "expo-mlkit-ocr";
import { Platform } from "react-native";

export type OcrBox = { x: number; y: number; width: number; height: number };
export type OcrElement = { text: string; boundingBox: OcrBox };
export type OcrLine = {
  text: string;
  boundingBox: OcrBox;
  elements: OcrElement[];
};
export type OcrBlock = { text: string; boundingBox: OcrBox; lines: OcrLine[] };
export type OcrRecognition = { text: string; blocks: OcrBlock[] };

export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrUnavailableError";
  }
}

type NativeOcr = {
  isSupported(): boolean;
  recognizeText(uri: string): Promise<RecognitionResult>;
};

export async function recognizeTimetableImage(
  uri: string,
): Promise<OcrRecognition> {
  if (Platform.OS === "web")
    throw new OcrUnavailableError(
      "Photo recognition is available in the iOS and Android app. You can still paste or import TXT/CSV on web.",
    );
  if (Constants.appOwnership === "expo")
    throw new OcrUnavailableError(
      "Offline photo recognition needs a BusBell development build and cannot run inside Expo Go.",
    );
  try {
    const ocr = requireOptionalNativeModule<NativeOcr>("ExpoMlkitOcr");
    if (!ocr)
      throw new OcrUnavailableError(
        "Offline photo recognition is not installed in this build. Rebuild the BusBell development app.",
      );
    if (!ocr.isSupported())
      throw new OcrUnavailableError(
        "Offline text recognition is not supported on this device.",
      );
    return await ocr.recognizeText(uri);
  } catch (error) {
    if (error instanceof OcrUnavailableError) throw error;
    throw new Error(
      error instanceof Error
        ? `Text recognition failed: ${error.message}`
        : "Text recognition failed. Try a clearer, straighter photo.",
    );
  }
}
