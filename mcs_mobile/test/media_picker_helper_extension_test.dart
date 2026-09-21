import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/core/utils/media_picker_helper.dart';

void main() {
  test('isImage recognizes common photo extensions', () {
    for (final name in ['a.jpg', 'a.JPEG', 'a.png', 'a.gif', 'a.webp', 'a.bmp']) {
      expect(MediaPickerHelper.isImage(name), isTrue, reason: name);
    }
    expect(MediaPickerHelper.isImage('a.pdf'), isFalse);
  });

  test('isPdf recognizes .pdf case-insensitively', () {
    expect(MediaPickerHelper.isPdf('dokumen.pdf'), isTrue);
    expect(MediaPickerHelper.isPdf('DOKUMEN.PDF'), isTrue);
    expect(MediaPickerHelper.isPdf('dokumen.docx'), isFalse);
  });

  test('isVideo recognizes common video extensions', () {
    for (final name in ['a.mp4', 'a.MOV', 'a.avi', 'a.mkv', 'a.webm', 'a.3gp']) {
      expect(MediaPickerHelper.isVideo(name), isTrue, reason: name);
    }
    expect(MediaPickerHelper.isVideo('a.jpg'), isFalse);
  });

  test('a filename never matches more than one of image/pdf/video', () {
    const samples = [
      'foto.jpg',
      'laporan.pdf',
      'rekaman.mp4',
      'surat.docx',
      'data.xlsx',
    ];
    for (final name in samples) {
      final matches = [
        MediaPickerHelper.isImage(name),
        MediaPickerHelper.isPdf(name),
        MediaPickerHelper.isVideo(name),
      ].where((matched) => matched).length;
      expect(matches, lessThanOrEqualTo(1), reason: name);
    }
  });
}
