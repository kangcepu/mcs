import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/constants/api_constants.dart';

class ReportSoRepository {
  final Map<String, Map<String, int>> _summaryCache = {};

  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  Future<Map<String, String>> _getHeaders({bool withAuth = true}) async {
    final token = await _getToken();
    return {
      if (withAuth) 'Authorization': 'Bearer ${token ?? ''}',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  Uri _soUri(String path, {Map<String, String>? query}) {
    return Uri.parse('${ApiConstants.soBaseUrl}$path').replace(
      queryParameters: query,
    );
  }

  Future<Map<String, dynamic>> _requestJson(
    String path, {
    Map<String, String>? query,
    bool withAuth = true,
  }) async {
    final uri = _soUri(path, query: query);
    try {
      final response =
          await http.get(uri, headers: await _getHeaders(withAuth: withAuth));
      dynamic body;
      if (response.body.isNotEmpty) {
        body = jsonDecode(response.body);
      } else {
        body = [];
      }
      return {
        'ok': response.statusCode >= 200 && response.statusCode < 300,
        'statusCode': response.statusCode,
        'body': body,
        'url': uri.toString(),
        'message': _extractApiMessage(body) ??
            'Request gagal (${response.statusCode})',
      };
    } catch (e) {
      return {
        'ok': false,
        'statusCode': 0,
        'body': [],
        'url': uri.toString(),
        'message': 'Gagal terhubung ke service SO',
      };
    }
  }

  String? _extractApiMessage(dynamic body) {
    if (body is Map<String, dynamic>) {
      final message = body['message'] ?? body['error'];
      if (message != null) {
        final text = message.toString().trim();
        if (text.isNotEmpty) {
          return text;
        }
      }
    }
    return null;
  }

  List<dynamic> _extractList(dynamic body) {
    if (body is List) {
      return body;
    }
    if (body is Map<String, dynamic>) {
      final data = body['data'];
      if (data is List) {
        return data;
      }
      if (data is Map) {
        return data.values.toList();
      }
    }
    return [];
  }

  String _readValue(Map<String, dynamic> row, List<String> keys) {
    final lowerMap = <String, dynamic>{};
    row.forEach((key, value) {
      lowerMap[key.toLowerCase()] = value;
    });
    for (final key in keys) {
      final value = lowerMap[key.toLowerCase()];
      if (value == null) {
        continue;
      }
      final text = value.toString().trim();
      if (text.isNotEmpty && text.toLowerCase() != 'null') {
        return text;
      }
    }
    return '';
  }

  List<String> _readList(Map<String, dynamic> row, List<String> keys) {
    for (final key in keys) {
      final entry = row.entries.firstWhere(
        (item) => item.key.toLowerCase() == key.toLowerCase(),
        orElse: () => const MapEntry('', null),
      );
      if (entry.key.isEmpty) {
        continue;
      }

      final value = entry.value;
      if (value is List) {
        return value
            .map((e) => e.toString().trim())
            .where((e) => e.isNotEmpty)
            .toSet()
            .toList();
      }
      if (value != null) {
        final text = value.toString().trim();
        if (text.isNotEmpty) {
          return [text];
        }
      }
    }
    return [];
  }

  int _toInt(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    if (value is double) return value.toInt();
    return int.tryParse(value.toString()) ?? 0;
  }

  bool _isTruthy(String value) {
    final raw = value.trim().toLowerCase();
    return raw == '1' || raw == 'true' || raw == 'yes';
  }

  String _normalizeDateDisplay(String value) {
    final raw = value.trim();
    if (raw.isEmpty ||
        raw == '0000-00-00' ||
        raw == '0000-00-00 00:00:00' ||
        raw == '-') {
      return '-';
    }

    final normalized = raw.split(' ').first.replaceAll('/', '-');
    final ymd = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');
    final dmy = RegExp(r'^(\d{2})-(\d{2})-(\d{4})$');

    DateTime? date;
    if (ymd.hasMatch(normalized)) {
      date = DateTime.tryParse(normalized);
    } else if (dmy.hasMatch(normalized)) {
      final m = dmy.firstMatch(normalized)!;
      date = DateTime.tryParse('${m.group(3)}-${m.group(2)}-${m.group(1)}');
    } else {
      date = DateTime.tryParse(raw);
    }

    if (date == null) return raw;
    final months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${date.day.toString().padLeft(2, '0')} ${months[date.month - 1]} ${date.year}';
  }

  String _normalizeDateForCompare(String value) {
    final raw = value.trim();
    if (raw.isEmpty || raw == '-' || raw == '0000-00-00') {
      return '';
    }
    final normalized = raw.split(' ').first.replaceAll('/', '-');
    final ymd = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');
    final dmy = RegExp(r'^(\d{2})-(\d{2})-(\d{4})$');
    if (ymd.hasMatch(normalized)) {
      return normalized;
    }
    if (dmy.hasMatch(normalized)) {
      final m = dmy.firstMatch(normalized)!;
      return '${m.group(3)}-${m.group(2)}-${m.group(1)}';
    }
    final dt = DateTime.tryParse(raw);
    if (dt == null) {
      return '';
    }
    return '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  bool _isDateWithinRange(String value, String startDate, String endDate) {
    final current = _normalizeDateForCompare(value);
    if (current.isEmpty) {
      return startDate.isEmpty && endDate.isEmpty;
    }

    if (startDate.isNotEmpty && current.compareTo(startDate) < 0) {
      return false;
    }
    if (endDate.isNotEmpty && current.compareTo(endDate) > 0) {
      return false;
    }
    return true;
  }

  Map<String, int> _extractSummaryFromHeader(Map<String, dynamic> row) {
    return {
      'asset_total': _toInt(_readValue(row,
          const ['asset_total', 'TotalAsset', 'total_asset', 'totalAsset'])),
      'asset_checked': _toInt(_readValue(
          row, const ['asset_checked', 'AssetChecked', 'assetChecked'])),
      'bom_total': _toInt(_readValue(
          row, const ['bom_total', 'TotalBOM', 'total_bom', 'totalBOM'])),
      'bom_checked': _toInt(_readValue(row,
          const ['bom_checked', 'BOMChecked', 'bom_checked', 'bomChecked'])),
    };
  }

  Future<Map<String, int>> _getSummaryByNoSo(String noSo, String type) async {
    final key = '$noSo|$type';
    if (_summaryCache.containsKey(key)) {
      return _summaryCache[key]!;
    }

    if (type == 'BOM') {
      final response = await _requestJson(
          '/api/no-stock-opname-current-bom/${Uri.encodeComponent(noSo)}');
      final assets =
          response['ok'] == true ? _extractList(response['body']) : <dynamic>[];

      var assetTotal = assets.length;
      var assetChecked = 0;
      var bomTotal = 0;
      var bomChecked = 0;

      for (final item in assets) {
        final row = Map<String, dynamic>.from(item as Map);
        final partsCount =
            _toInt(_readValue(row, const ['partsCount', 'parts_count']));
        final qtyFound =
            _toInt(_readValue(row, const ['qtyFound', 'qty_found']));
        bomTotal += partsCount < 0 ? 0 : partsCount;
        bomChecked += qtyFound < 0 ? 0 : qtyFound;
        if (partsCount > 0 && qtyFound >= partsCount) {
          assetChecked++;
        }
      }

      final summary = {
        'asset_total': assetTotal,
        'asset_checked': assetChecked,
        'bom_total': bomTotal,
        'bom_checked': bomChecked,
      };
      _summaryCache[key] = summary;
      return summary;
    }

    final checkedResponse =
        await _requestJson('/api/no-stock-opname/${Uri.encodeComponent(noSo)}');
    final pendingResponse = await _requestJson(
        '/api/no-stock-opname-current/${Uri.encodeComponent(noSo)}');
    final checked = checkedResponse['ok'] == true
        ? _extractList(checkedResponse['body'])
        : <dynamic>[];
    final pending = pendingResponse['ok'] == true
        ? _extractList(pendingResponse['body'])
        : <dynamic>[];

    final summary = {
      'asset_total': checked.length + pending.length,
      'asset_checked': checked.length,
      'bom_total': 0,
      'bom_checked': 0,
    };
    _summaryCache[key] = summary;
    return summary;
  }

  Future<Map<String, dynamic>> getList({
    String noSo = '',
    String type = '',
    String startDate = '',
    String endDate = '',
  }) async {
    final response = await _requestJson('/api/no-stock-opname');
    if (response['ok'] != true) {
      return {
        'status': false,
        'message': response['message'] ?? 'Gagal memuat report SO',
        'rows': <Map<String, dynamic>>[],
      };
    }

    final rawRows = _extractList(response['body']);
    final prepared = <Map<String, dynamic>>[];
    final filterNoSo = noSo.trim().toLowerCase();
    final filterType = type.trim().toUpperCase();

    for (final raw in rawRows) {
      final row = Map<String, dynamic>.from(raw as Map);
      final currentNoSo = _readValue(row, const ['NoSO', 'no_so', 'noso']);
      if (currentNoSo.isEmpty) {
        continue;
      }

      final isBom = _isTruthy(_readValue(row, const ['IsBOM', 'is_bom']));
      final currentType = isBom ? 'BOM' : 'ASSET';

      if (filterType.isNotEmpty && currentType != filterType) {
        continue;
      }
      if (filterNoSo.isNotEmpty &&
          !currentNoSo.toLowerCase().contains(filterNoSo)) {
        continue;
      }

      final rawDate =
          _readValue(row, const ['Tanggal', 'tanggal', 'date', 'created_at']);
      if (!_isDateWithinRange(rawDate, startDate.trim(), endDate.trim())) {
        continue;
      }

      final rawLocked = _readValue(row, const ['LockedDate', 'locked_date']);
      prepared.add({
        'raw': row,
        'no_so': currentNoSo,
        'type': currentType,
        'tanggal': _normalizeDateDisplay(rawDate),
        'locked_date': _normalizeDateDisplay(rawLocked),
        'raw_tanggal': rawDate,
        'raw_locked_date': rawLocked,
      });
    }

    final shouldFetchSummary = prepared.length <= 20 || filterNoSo.isNotEmpty;
    final rows = <Map<String, dynamic>>[];

    for (final row in prepared) {
      final header = Map<String, dynamic>.from(row['raw'] as Map);
      var summary = _extractSummaryFromHeader(header);
      if (shouldFetchSummary &&
          summary['asset_total'] == 0 &&
          summary['bom_total'] == 0) {
        summary = await _getSummaryByNoSo(
          row['no_so'].toString(),
          row['type'].toString(),
        );
      }

      rows.add({
        'no_so': row['no_so'],
        'tanggal': row['tanggal'],
        'type': row['type'],
        'locked_date': row['locked_date'],
        'raw_tanggal': row['raw_tanggal'],
        'raw_locked_date': row['raw_locked_date'],
        'asset_total': summary['asset_total'] ?? 0,
        'asset_checked': summary['asset_checked'] ?? 0,
        'bom_total': summary['bom_total'] ?? 0,
        'bom_checked': summary['bom_checked'] ?? 0,
        'companies': _readList(
            header, const ['companies', 'Companies', 'company', 'CompanyName']),
        'locations': _readList(header,
            const ['locations', 'Locations', 'location', 'LocationAsset']),
      });
    }

    return {
      'status': true,
      'rows': rows,
      'message': '',
    };
  }

  Future<Map<String, dynamic>> _fetchHeader(String noSo) async {
    final response = await _requestJson('/api/no-stock-opname');
    if (response['ok'] != true) {
      return {};
    }

    final rows = _extractList(response['body']);
    for (final raw in rows) {
      final row = Map<String, dynamic>.from(raw as Map);
      final currentNoSo = _readValue(row, const ['NoSO', 'no_so', 'noso']);
      if (currentNoSo != noSo) continue;

      final rawDate =
          _readValue(row, const ['Tanggal', 'tanggal', 'date', 'created_at']);
      final rawLocked = _readValue(row, const ['LockedDate', 'locked_date']);
      final isBom = _isTruthy(_readValue(row, const ['IsBOM', 'is_bom']));
      return {
        'no_so': currentNoSo,
        'tanggal': _normalizeDateDisplay(rawDate),
        'type': isBom ? 'BOM' : 'ASSET',
        'locked_date': _normalizeDateDisplay(rawLocked),
        'raw_tanggal': rawDate,
        'raw_locked_date': rawLocked,
        'companies': _readList(
            row, const ['companies', 'Companies', 'company', 'CompanyName']),
        'locations': _readList(
            row, const ['locations', 'Locations', 'location', 'LocationAsset']),
      };
    }
    return {};
  }

  Future<List<Map<String, dynamic>>> _getAssetDetails(
      String noSo, bool isBom) async {
    if (isBom) {
      final response = await _requestJson(
          '/api/no-stock-opname-current-bom/${Uri.encodeComponent(noSo)}');
      if (response['ok'] != true) return [];
      final rows = _extractList(response['body']);
      return rows.map((raw) {
        final row = Map<String, dynamic>.from(raw as Map);
        return {
          'asset_code': _readValue(row, const ['AssetCode', 'asset_code']),
          'asset_name': _readValue(row, const ['AssetName', 'asset_name']),
          'status': _readValue(row, const ['status', 'Status']),
          'username': _readValue(row, const ['username', 'Username']),
          'parts_count':
              _toInt(_readValue(row, const ['partsCount', 'parts_count'])),
          'qty_found': _toInt(_readValue(row, const ['qtyFound', 'qty_found'])),
        };
      }).toList();
    }

    final checkedResponse =
        await _requestJson('/api/no-stock-opname/${Uri.encodeComponent(noSo)}');
    final pendingResponse = await _requestJson(
        '/api/no-stock-opname-current/${Uri.encodeComponent(noSo)}');
    final checked = checkedResponse['ok'] == true
        ? _extractList(checkedResponse['body'])
        : <dynamic>[];
    final pending = pendingResponse['ok'] == true
        ? _extractList(pendingResponse['body'])
        : <dynamic>[];

    final map = <String, Map<String, dynamic>>{};
    for (final raw in checked) {
      final row = Map<String, dynamic>.from(raw as Map);
      final code = _readValue(row, const ['AssetCode', 'asset_code']);
      if (code.isEmpty) continue;
      map[code] = {
        'asset_code': code,
        'asset_name': _readValue(row, const ['AssetName', 'asset_name']),
        'status': 'CHECKED',
        'username': _readValue(row, const ['username', 'Username']),
      };
    }
    for (final raw in pending) {
      final row = Map<String, dynamic>.from(raw as Map);
      final code = _readValue(row, const ['AssetCode', 'asset_code']);
      if (code.isEmpty) continue;
      final existing = map[code] ?? {};
      final status = _readValue(row, const ['status', 'Status']);
      map[code] = {
        'asset_code': code,
        'asset_name': _readValue(row, const ['AssetName', 'asset_name']),
        'status': status.isNotEmpty ? status : (existing['status'] ?? ''),
        'username': _readValue(row, const ['username', 'Username']),
      };
    }
    return map.values.toList();
  }

  void _flattenBomItems(
    List<dynamic> items,
    String assetCode,
    List<Map<String, dynamic>> output, {
    String headerFallback = '',
  }) {
    for (final raw in items) {
      if (raw is! Map) continue;
      final row = Map<String, dynamic>.from(raw);
      final level = _readValue(row, const ['level', 'Level']).toLowerCase();
      var header = _readValue(row, const ['header', 'Header']);
      if (header.isEmpty) {
        header = headerFallback;
      }

      if (level != 'relationship') {
        output.add({
          'asset_code': assetCode,
          'header': header,
          'part': _readValue(row, const ['part', 'Part']),
          'qty_on_hand': _readValue(row, const ['qty_on_hand', 'qtyOnHand']),
          'qty_found': _readValue(row, const ['qty_found', 'qtyFound']),
          'uom': _readValue(row, const ['uom', 'UOM']),
          'remark': _readValue(row, const ['remark', 'Remark']),
        });
      }

      final nested = row['parts'];
      if (nested is List && nested.isNotEmpty) {
        _flattenBomItems(nested, assetCode, output, headerFallback: header);
      }
    }
  }

  Future<List<Map<String, dynamic>>> _getBomDetails(
    String noSo,
    List<Map<String, dynamic>> assets,
  ) async {
    final output = <Map<String, dynamic>>[];
    final assetCodes = <String>{};
    for (final asset in assets) {
      final code = (asset['asset_code'] ?? '').toString().trim();
      if (code.isNotEmpty) {
        assetCodes.add(code);
      }
    }

    for (final code in assetCodes) {
      final response = await _requestJson(
        '/api/part-bom',
        query: {
          'noSO': noSo,
          'assetCode': code,
        },
      );
      if (response['ok'] != true) {
        continue;
      }
      _flattenBomItems(
        _extractList(response['body']),
        code,
        output,
      );
    }

    return output;
  }

  Future<List<Map<String, dynamic>>> _getNonAssetDetails(String noSo) async {
    final response = await _requestJson(
        '/api/no-asset-stock-opname/${Uri.encodeComponent(noSo)}');
    if (response['ok'] != true) return [];
    final rows = _extractList(response['body']);
    return rows.map((raw) {
      final row = Map<String, dynamic>.from(raw as Map);
      return {
        'name':
            _readValue(row, const ['non_asset_name', 'name', 'NonAssetName']),
        'location': _readValue(row, const [
          'location_code',
          'location',
          'LocationAsset',
          'LocationCode'
        ]),
        'remark': _readValue(row, const ['remark', 'Remark']),
      };
    }).toList();
  }

  Future<List<Map<String, dynamic>>> _getNonPartDetails(String noSo) async {
    final response = await _requestJson(
        '/api/non-part-stock-opname/${Uri.encodeComponent(noSo)}');
    if (response['ok'] != true) return [];
    final rows = _extractList(response['body']);
    return rows.map((raw) {
      final row = Map<String, dynamic>.from(raw as Map);
      return {
        'part_name': _readValue(
            row, const ['non_part_name', 'part_name', 'name', 'NonPartName']),
        'qty': _readValue(row, const ['qty', 'Qty']),
        'remark': _readValue(row, const ['remark', 'Remark']),
      };
    }).toList();
  }

  Future<Map<String, dynamic>> getDetail(String noSo) async {
    final safeNoSo = noSo.trim();
    if (safeNoSo.isEmpty) {
      return {
        'status': false,
        'found': false,
        'message': 'No SO kosong',
      };
    }

    final header = await _fetchHeader(safeNoSo);
    var isBom = (header['type'] ?? '').toString().toUpperCase() == 'BOM';

    final assetDetails = await _getAssetDetails(safeNoSo, isBom);
    if (header.isEmpty) {
      final first = assetDetails.isNotEmpty ? assetDetails.first : {};
      if (first['parts_count'] != null) {
        isBom = true;
      }
    }

    final bomDetails = isBom
        ? await _getBomDetails(safeNoSo, assetDetails)
        : <Map<String, dynamic>>[];
    final nonAssetDetails = await _getNonAssetDetails(safeNoSo);
    final nonPartDetails = await _getNonPartDetails(safeNoSo);

    final fallbackHeader = {
      'no_so': safeNoSo,
      'tanggal': '-',
      'type': isBom ? 'BOM' : 'ASSET',
      'locked_date': '-',
      'raw_tanggal': '',
      'raw_locked_date': '',
      'companies': <String>[],
      'locations': <String>[],
    };

    return {
      'status': true,
      'found': header.isNotEmpty ||
          assetDetails.isNotEmpty ||
          bomDetails.isNotEmpty ||
          nonAssetDetails.isNotEmpty ||
          nonPartDetails.isNotEmpty,
      'header': header.isNotEmpty ? header : fallbackHeader,
      'asset_details': assetDetails,
      'bom_details': bomDetails,
      'non_asset_details': nonAssetDetails,
      'non_part_details': nonPartDetails,
    };
  }

  Future<Map<String, dynamic>> downloadReportPdf(
      Map<String, dynamic> row) async {
    final noSo = (row['no_so'] ?? '').toString().trim();
    if (noSo.isEmpty) {
      return {'status': false, 'message': 'No SO kosong'};
    }

    final type = (row['type'] ?? '').toString().toUpperCase();
    final companies = (row['companies'] is List)
        ? (row['companies'] as List)
            .map((e) => e.toString())
            .where((e) => e.trim().isNotEmpty)
            .toList()
        : <String>[];
    final locations = (row['locations'] is List)
        ? (row['locations'] as List)
            .map((e) => e.toString())
            .where((e) => e.trim().isNotEmpty)
            .toList()
        : <String>[];

    final rawDate = (row['raw_tanggal'] ?? '').toString().trim();
    final rawLocked = (row['raw_locked_date'] ?? '').toString().trim();
    final displayDate = (row['tanggal'] ?? '').toString().trim();
    final query = {
      'tanggal': rawDate.isNotEmpty ? rawDate : displayDate,
      'lockeddate': (rawLocked.isNotEmpty && rawLocked != '-') ? rawLocked : '',
      'perusahaan': companies.isNotEmpty ? companies.join(', ') : '-',
    };

    var path = '/api/report/${Uri.encodeComponent(noSo)}/pdf';
    var filename = 'laporan_${noSo.replaceAll('.', '_')}.pdf';
    if (type == 'BOM') {
      path = '/api/report-so-bom/${Uri.encodeComponent(noSo)}/pdf';
      query['lokasi'] = locations.isNotEmpty ? locations.join(', ') : '-';
      filename = 'laporan_bom_${noSo.replaceAll('.', '_')}.pdf';
    }

    final uri = _soUri(path, query: query);
    try {
      final response =
          await http.get(uri, headers: await _getHeaders(withAuth: false));
      if (response.statusCode == 200) {
        return {
          'status': true,
          'bytes': response.bodyBytes,
          'filename': filename,
        };
      }
      return {
        'status': false,
        'message': 'Gagal download PDF (${response.statusCode})',
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Gagal terhubung ke server',
      };
    }
  }
}
