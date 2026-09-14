import 'dart:io';

import 'package:image/image.dart' as img;
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

class MediaTimestampHelper {
  static Future<File?> stampImage(File sourceFile, DateTime capturedAt) async {
    try {
      final bytes = await sourceFile.readAsBytes();
      final decoded = img.decodeImage(bytes);
      if (decoded == null) {
        return sourceFile;
      }

      final text = DateFormat('yyyy-MM-dd HH:mm:ss').format(capturedAt);
      final textWidth = _measureTextWidth(text, img.arial24);
      final textHeight = img.arial24.lineHeight;
      const padding = 12;

      final bgX1 = (decoded.width - textWidth - (padding * 2))
          .clamp(0, decoded.width - 1);
      final bgY1 = (decoded.height - textHeight - (padding * 2))
          .clamp(0, decoded.height - 1);
      final bgX2 = decoded.width - 1;
      final bgY2 = decoded.height - 1;

      img.fillRect(
        decoded,
        x1: bgX1,
        y1: bgY1,
        x2: bgX2,
        y2: bgY2,
        color: img.ColorRgba8(0, 0, 0, 170),
      );
      img.drawString(
        decoded,
        text,
        font: img.arial24,
        x: bgX1 + padding,
        y: bgY1 + padding - 2,
        color: img.ColorRgb8(255, 255, 255),
      );

      final dir = await getTemporaryDirectory();
      final outputPath =
          '${dir.path}/dc_stamp_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final outputFile = File(outputPath);
      final encoded = img.encodeJpg(decoded, quality: 85);
      await outputFile.writeAsBytes(encoded, flush: true);
      return outputFile;
    } catch (_) {
      return sourceFile;
    }
  }

  static int _measureTextWidth(String text, img.BitmapFont font) {
    var width = 0;
    for (final charCode in text.codeUnits) {
      final ch = font.characters[charCode];
      if (ch != null) {
        width += ch.xAdvance;
      }
    }
    return width;
  }
}
