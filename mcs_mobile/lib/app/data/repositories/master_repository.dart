import 'dart:convert';

import '../providers/api_service.dart';
import '../../core/constants/api_constants.dart';

class MasterRepository {
  final ApiService _apiService = ApiService();

  Future<List<Map<String, dynamic>>> getCompanies() async {
    try {
      final response = await _apiService.get(ApiConstants.companies);

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return List<Map<String, dynamic>>.from(data['data']);
        }
      }
      return [];
    } catch (e) {
      throw Exception('Get companies error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getDivisions() async {
    try {
      final response = await _apiService.get(ApiConstants.divisions);

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return List<Map<String, dynamic>>.from(data['data']);
        }
      }
      return [];
    } catch (e) {
      throw Exception('Get divisions error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getSections() async {
    try {
      final response = await _apiService.get(ApiConstants.sections);

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return List<Map<String, dynamic>>.from(data['data']);
        }
      }
      return [];
    } catch (e) {
      throw Exception('Get sections error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getAssets({String? search}) async {
    try {
      final queryParams = {
        if (search != null && search.isNotEmpty) 'q': search,
      };

      final response = await _apiService.get(
        ApiConstants.assets,
        queryParameters: queryParams,
      );

      print('🔍 Assets API Response:');
      print('   Status Code: ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['success'] == true) {
          final responseData = data['data'];

          if (responseData is List) {
            print('   ✅ Format: List with ${responseData.length} items');
            return List<Map<String, dynamic>>.from(responseData);
          } else if (responseData is Map) {
            final firstKey = responseData.keys.first.toString();

            if (firstKey == '0' || int.tryParse(firstKey) != null) {
              print(
                  '   ✅ Format: PHP numeric-keyed Map with ${responseData.length} items');
              final List<Map<String, dynamic>> assetsList = [];

              responseData.forEach((key, value) {
                if (value is Map<String, dynamic>) {
                  assetsList.add(value);
                }
              });

              print('   ✅ Converted to list: ${assetsList.length} items');
              return assetsList;
            } else if (responseData.containsKey('items')) {
              final items = responseData['items'];
              print('   ✅ Found items array with ${items.length} items');
              return List<Map<String, dynamic>>.from(items);
            } else {
              print('   ⚠️ Unknown Map format, wrapping in list');
              return List<Map<String, dynamic>>.from([responseData]);
            }
          }
        }
      }
      return [];
    } catch (e) {
      print('❌ getAssets error: $e');
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getAssetMutations({String? search}) async {
    try {
      final queryParams = <String, dynamic>{
        'limit': 300,
        if (search != null && search.trim().isNotEmpty) 'q': search.trim(),
      };

      final response = await _apiService.get(
        ApiConstants.assetMutations,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['success'] == true && data['data'] is List) {
          return List<Map<String, dynamic>>.from(data['data']);
        }
      }
      return [];
    } catch (e) {
      throw Exception('Get asset mutations error: $e');
    }
  }

  Future<Map<String, dynamic>> getAssetDetail({
    required String assetCode,
  }) async {
    final code = assetCode.trim();
    if (code.isEmpty) {
      return {};
    }

    try {
      final response = await _apiService.get(
        ApiConstants.assetDetail,
        queryParameters: {'id': code},
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data is Map<String, dynamic> &&
            data['success'] == true &&
            data['data'] is Map) {
          return Map<String, dynamic>.from(data['data'] as Map);
        }
      }

      return {};
    } catch (e) {
      throw Exception('Get asset detail error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getWoTypes() async {
    try {
      final response = await _apiService.get(ApiConstants.woTypes);

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return List<Map<String, dynamic>>.from(data['data']);
        }
      }
      return [];
    } catch (e) {
      throw Exception('Get WO types error: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getPriorities() async {
    try {
      final response = await _apiService.get(ApiConstants.priorities);

      if (response.statusCode == 200) {
        final data = response.data;
        if (data['status'] == true) {
          return List<Map<String, dynamic>>.from(data['data']);
        }
      }
      return [];
    } catch (e) {
      throw Exception('Get priorities error: $e');
    }
  }

  String? _extractQrId(String rawValue) {
    final value = rawValue.trim();
    if (value.isEmpty) {
      return null;
    }

    final directMatch =
        RegExp(r'[?&]id=([^&]+)', caseSensitive: false).firstMatch(value);
    if (directMatch != null) {
      return Uri.decodeComponent(directMatch.group(1) ?? '').trim();
    }

    final parsed = Uri.tryParse(value);
    if (parsed != null) {
      final id = parsed.queryParameters['id'];
      if (id != null && id.trim().isNotEmpty) {
        return Uri.decodeComponent(id).trim();
      }
    }

    return null;
  }

  Map<String, dynamic>? _decodeMap(dynamic raw) {
    dynamic data = raw;
    if (data is String) {
      try {
        data = jsonDecode(data);
      } catch (_) {
        return null;
      }
    }
    if (data is Map<String, dynamic>) {
      return data;
    }
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    return null;
  }

  Map<String, dynamic> _normalizeAssetMap(Map<String, dynamic> asset) {
    final normalized = Map<String, dynamic>.from(asset);
    final company = normalized['Company'] ??
        normalized['CompanyName'] ??
        normalized['company'];
    if (company != null) {
      normalized['Company'] = company;
    }
    if (normalized['AssetID'] != null) {
      normalized['id_equipment'] = normalized['AssetID'];
    }
    return normalized;
  }

  /// QR code asset di-generate dari `bin2hex(AssetCode)` (lihat `conv()` di
  /// legacy `mcsh_helper.php`) — decode balik ke AssetCode lalu cari lewat
  /// backend baru, bukan lagi lewat endpoint web legacy `/equipment/search_scan`.
  String? _hexDecodeAssetCode(String hex) {
    final cleaned = hex.trim();
    if (cleaned.isEmpty || cleaned.length.isOdd) return null;
    final bytes = <int>[];
    for (var i = 0; i < cleaned.length; i += 2) {
      final byte = int.tryParse(cleaned.substring(i, i + 2), radix: 16);
      if (byte == null) return null;
      bytes.add(byte);
    }
    try {
      return utf8.decode(bytes);
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> getAssetByQrId(String qrId) async {
    final id = qrId.trim();
    if (id.isEmpty) {
      return null;
    }

    final assetCode = _hexDecodeAssetCode(id) ?? id;

    try {
      final response = await _apiService.get(
        ApiConstants.assetDetail,
        queryParameters: {'id': assetCode},
      );

      if (response.statusCode != 200) {
        return null;
      }

      final data = response.data;
      if (data is! Map<String, dynamic> || data['success'] != true) {
        return null;
      }

      final decoded = _decodeMap(data['data']);
      if (decoded == null || decoded.isEmpty) {
        return null;
      }

      return _normalizeAssetMap(decoded);
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> findAssetByScanValue(String rawValue) async {
    final value = rawValue.trim();
    if (value.isEmpty) {
      return null;
    }

    final qrId = _extractQrId(value);
    if (qrId != null && qrId.isNotEmpty) {
      final byQr = await getAssetByQrId(qrId);
      if (byQr != null) {
        return byQr;
      }
    }

    final fallbackCode = value.contains('/') ? value.split('/').last : value;
    final search = fallbackCode.trim();
    if (search.isEmpty) {
      return null;
    }

    final assets = await getAssets(search: search);
    if (assets.isEmpty) {
      return null;
    }

    Map<String, dynamic>? exact;
    for (final asset in assets) {
      final code = (asset['AssetCode'] ?? '').toString().trim().toUpperCase();
      if (code == search.toUpperCase()) {
        exact = asset;
        break;
      }
    }

    final resolved = exact ?? assets.first;
    return _normalizeAssetMap(resolved);
  }
}
