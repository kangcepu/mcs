import 'package:intl/intl.dart';

const String _kAppDisplayDatePattern = 'dd-MMM-yyyy';

DateTime? tryParseDisplayDate(String? raw) {
  final value = (raw ?? '').trim();
  if (value.isEmpty) {
    return null;
  }

  final parsed = DateTime.tryParse(value);
  if (parsed != null) {
    return parsed;
  }

  final normalized = value.replaceAll('/', '-');
  final parts = normalized.split('-');
  if (parts.length == 3) {
    final year = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final day = int.tryParse(parts[2]);
    if (year != null && month != null && day != null) {
      return DateTime(year, month, day);
    }
  }

  return null;
}

String formatDisplayDate(String? raw, {String fallback = '-'}) {
  final parsed = tryParseDisplayDate(raw);
  if (parsed == null) {
    final value = (raw ?? '').trim();
    return value.isEmpty ? fallback : value;
  }

  return DateFormat(_kAppDisplayDatePattern).format(parsed);
}

String formatDisplayDateValue(DateTime value) {
  return DateFormat(_kAppDisplayDatePattern).format(value);
}

String formatDisplayDateTime(String? raw, {String fallback = '-'}) {
  final parsed = tryParseDisplayDate(raw);
  if (parsed == null) {
    final value = (raw ?? '').trim();
    return value.isEmpty ? fallback : value;
  }

  return DateFormat('$_kAppDisplayDatePattern HH:mm').format(parsed);
}
