import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/asset_after_model.dart';
import '../models/asset_before_model.dart';
import '../models/asset_before_bom_model.dart';
import '../models/asset_bom_model.dart';
import '../models/category_model.dart';
import '../models/company_model.dart';
import '../models/location_model.dart';
import '../../core/constants/api_constants.dart';

class StockOpnameInputRepository {
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

  Map<String, dynamic> _normalizeListResponse(
    dynamic decoded, {
    required String dataKey,
    required int fallbackOffset,
  }) {
    if (decoded is List) {
      return {
        dataKey: decoded,
        'total': decoded.length,
        'nextOffset': fallbackOffset + decoded.length,
        'hasMore': false,
      };
    }

    if (decoded is Map<String, dynamic>) {
      final rawData = decoded[dataKey] ?? decoded['data'] ?? <dynamic>[];
      final listData = rawData is List ? rawData : <dynamic>[];
      final rawTotal = decoded['total'] ?? listData.length;
      final total = rawTotal is int
          ? rawTotal
          : int.tryParse(rawTotal.toString()) ?? listData.length;
      final rawNext =
          decoded['nextOffset'] ?? (fallbackOffset + listData.length);
      final nextOffset = rawNext is int
          ? rawNext
          : int.tryParse(rawNext.toString()) ??
              (fallbackOffset + listData.length);
      final hasMoreRaw = decoded['hasMore'];
      final hasMore = hasMoreRaw is bool
          ? hasMoreRaw
          : hasMoreRaw == null
              ? false
              : hasMoreRaw.toString().toLowerCase() == 'true';

      return {
        dataKey: listData,
        'total': total,
        'nextOffset': nextOffset,
        'hasMore': hasMore,
      };
    }

    throw Exception('Unexpected response format');
  }

  String _readMessage(dynamic responseBody, String fallback) {
    if (responseBody is Map<String, dynamic>) {
      return (responseBody['message'] ?? fallback).toString();
    }
    return fallback;
  }

  Map<String, dynamic> _tryDecodeMap(String body) {
    final raw = body.trim();
    if (raw.isEmpty) {
      return <String, dynamic>{};
    }
    try {
      final decoded = json.decode(raw);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      return <String, dynamic>{'message': raw};
    } catch (_) {
      return <String, dynamic>{'message': raw};
    }
  }

  String _stripBom(String value) {
    if (value.isEmpty) {
      return value;
    }
    var result = value;
    if (result.startsWith('\uFEFF')) {
      result = result.substring(1);
    }
    return result;
  }

  bool _isHtmlBody(String body) {
    final normalized = _stripBom(body).trimLeft().toLowerCase();
    return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
  }

  Future<http.Response> _postJson(
    Uri uri,
    Map<String, String> headers,
    Map<String, dynamic> body,
  ) async {
    final request = http.Request('POST', uri);
    request.followRedirects = false;
    request.headers.addAll(headers);
    request.body = json.encode(body);

    final streamed = await request.send();
    final bytes = await streamed.stream.toBytes();
    return http.Response.bytes(
      bytes,
      streamed.statusCode,
      request: request,
      headers: streamed.headers,
      isRedirect: streamed.isRedirect,
      reasonPhrase: streamed.reasonPhrase,
    );
  }

  bool _isMostlyPrintable(String value) {
    if (value.isEmpty) {
      return false;
    }
    var printable = 0;
    for (final codeUnit in value.codeUnits) {
      final isPrintable = codeUnit == 9 ||
          codeUnit == 10 ||
          codeUnit == 13 ||
          (codeUnit >= 32 && codeUnit <= 126);
      if (isPrintable) {
        printable += 1;
      }
    }
    return (printable / value.length) >= 0.9;
  }

  String _maybeDecodeHex(String value) {
    final raw = value.trim();
    if (raw.isEmpty) {
      return raw;
    }

    final isHex = RegExp(r'^[0-9a-fA-F]+$').hasMatch(raw);
    if (!isHex || raw.length.isOdd || raw.length < 6) {
      return raw;
    }

    try {
      final bytes = <int>[];
      for (var i = 0; i < raw.length; i += 2) {
        bytes.add(int.parse(raw.substring(i, i + 2), radix: 16));
      }
      final decoded = utf8.decode(bytes, allowMalformed: true).trim();
      if (decoded.isEmpty || !_isMostlyPrintable(decoded)) {
        return raw;
      }
      return decoded;
    } catch (_) {
      return raw;
    }
  }

  String _normalizeScannedAssetCode(String scannedValue) {
    final raw = scannedValue.trim();
    if (raw.isEmpty) {
      return raw;
    }

    String? extractIdFromText(String text) {
      final directMatch =
          RegExp(r'[?&]id=([^&]+)', caseSensitive: false).firstMatch(text);
      if (directMatch != null) {
        return Uri.decodeComponent(directMatch.group(1) ?? '').trim();
      }

      final parsed = Uri.tryParse(text);
      if (parsed != null) {
        final id = parsed.queryParameters['id'];
        if (id != null && id.trim().isNotEmpty) {
          return Uri.decodeComponent(id).trim();
        }
      }

      return null;
    }

    final extractedId = extractIdFromText(raw);
    if (extractedId != null && extractedId.isNotEmpty) {
      return _maybeDecodeHex(extractedId);
    }

    final parsed = Uri.tryParse(raw);
    if (parsed != null &&
        (parsed.scheme == 'http' || parsed.scheme == 'https')) {
      final lastSegment =
          parsed.pathSegments.isNotEmpty ? parsed.pathSegments.last : '';
      if (lastSegment.trim().isNotEmpty) {
        return Uri.decodeComponent(lastSegment).trim();
      }
    }

    return raw;
  }

  Future<Map<String, dynamic>> getAssetsAfter(
    String noSO, {
    int offset = 0,
    List<String>? companyFilters,
    List<String>? categoryFilters,
    List<String>? locationFilters,
  }) async {
    try {
      final uri = Uri.parse(ApiConstants.listAssets(noSO)).replace(
        queryParameters: {
          'offset': '$offset',
          if (companyFilters != null && companyFilters.isNotEmpty)
            'company': companyFilters.join(','),
          if (categoryFilters != null && categoryFilters.isNotEmpty)
            'category': categoryFilters.join(','),
          if (locationFilters != null && locationFilters.isNotEmpty)
            'location': locationFilters.join(','),
        },
      );

      final response = await http.get(uri, headers: await _getHeaders());
      final rawBody = response.body;

      if (_isHtmlBody(rawBody)) {
        debugPrint(
            'SO getAssetsAfter => HTML response code=${response.statusCode} url=$uri');
        return {
          'status': false,
          'message': 'Server mengembalikan HTML (cek endpoint/token).',
          'statusCode': response.statusCode,
        };
      }

      if (response.statusCode == 200) {
        dynamic decoded;
        try {
          decoded = json.decode(_stripBom(rawBody));
        } catch (e) {
          return {
            'status': false,
            'message': 'Gagal parse response JSON: $e',
            'statusCode': response.statusCode,
          };
        }
        final normalized = _normalizeListResponse(decoded,
            dataKey: 'data', fallbackOffset: offset);
        final items = (normalized['data'] as List<dynamic>)
            .map((item) => AssetAfter.fromJson(item as Map<String, dynamic>))
            .toList();

        return {
          'status': true,
          'data': items,
          'total': normalized['total'],
          'nextOffset': normalized['nextOffset'],
          'hasMore': normalized['hasMore'],
        };
      }

      final decoded = _tryDecodeMap(rawBody);
      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to fetch assets'),
        'statusCode': response.statusCode,
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Failed to connect to the server: $e',
        'statusCode': 0,
      };
    }
  }

  Future<Map<String, dynamic>> getAssetsBefore(
    String noSO, {
    int offset = 0,
    List<String>? companyFilters,
    List<String>? categoryFilters,
    List<String>? locationFilters,
  }) async {
    try {
      final uri = Uri.parse(ApiConstants.listAssetsBefore(noSO)).replace(
        queryParameters: {
          'offset': '$offset',
          if (companyFilters != null && companyFilters.isNotEmpty)
            'company': companyFilters.join(','),
          if (categoryFilters != null && categoryFilters.isNotEmpty)
            'category': categoryFilters.join(','),
          if (locationFilters != null && locationFilters.isNotEmpty)
            'location': locationFilters.join(','),
        },
      );

      final response = await http.get(uri, headers: await _getHeaders());
      final rawBody = response.body;

      if (_isHtmlBody(rawBody)) {
        debugPrint(
            'SO getAssetsBefore => HTML response code=${response.statusCode} url=$uri');
        return {
          'status': false,
          'message': 'Server mengembalikan HTML (cek endpoint/token).',
          'statusCode': response.statusCode,
        };
      }

      if (response.statusCode == 200) {
        dynamic decoded;
        try {
          decoded = json.decode(_stripBom(rawBody));
        } catch (e) {
          return {
            'status': false,
            'message': 'Gagal parse response JSON: $e',
            'statusCode': response.statusCode,
          };
        }
        final normalized = _normalizeListResponse(decoded,
            dataKey: 'data', fallbackOffset: offset);
        final items = (normalized['data'] as List<dynamic>)
            .map((item) => AssetBefore.fromJson(item as Map<String, dynamic>))
            .toList();

        return {
          'status': true,
          'data': items,
          'total': normalized['total'],
          'nextOffset': normalized['nextOffset'],
          'hasMore': normalized['hasMore'],
        };
      }

      final decoded = _tryDecodeMap(rawBody);
      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to fetch assets'),
        'statusCode': response.statusCode,
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Failed to connect to the server: $e',
        'statusCode': 0,
      };
    }
  }

  Future<Map<String, dynamic>> getAssetsBeforeBOM(
    String noSO, {
    int offset = 0,
    List<String>? companyFilters,
    List<String>? categoryFilters,
    List<String>? locationFilters,
  }) async {
    try {
      final uri = Uri.parse(ApiConstants.listAssetsBeforeBOM(noSO)).replace(
        queryParameters: {
          'offset': '$offset',
          if (companyFilters != null && companyFilters.isNotEmpty)
            'company': companyFilters.join(','),
          if (categoryFilters != null && categoryFilters.isNotEmpty)
            'category': categoryFilters.join(','),
          if (locationFilters != null && locationFilters.isNotEmpty)
            'location': locationFilters.join(','),
        },
      );

      final response = await http.get(uri, headers: await _getHeaders());

      if (response.statusCode == 200) {
        final decoded = json.decode(response.body);
        final normalized = _normalizeListResponse(decoded,
            dataKey: 'data', fallbackOffset: offset);
        final items = (normalized['data'] as List<dynamic>)
            .map((item) =>
                AssetBeforeBOMModel.fromJson(item as Map<String, dynamic>))
            .toList();

        return {
          'status': true,
          'data': items,
          'total': normalized['total'],
          'nextOffset': normalized['nextOffset'],
          'hasMore': normalized['hasMore'],
        };
      }

      final decoded = json.decode(response.body);
      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to fetch BOM assets'),
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Failed to connect to the server: $e'
      };
    }
  }

  Future<Map<String, dynamic>> getPartBOM(String noSO, String assetCode) async {
    try {
      final response = await http.get(
        Uri.parse(ApiConstants.getPartBOM(noSO, assetCode)),
        headers: await _getHeaders(),
      );

      if (response.statusCode == 200) {
        final decoded = json.decode(response.body);
        final normalized =
            _normalizeListResponse(decoded, dataKey: 'data', fallbackOffset: 0);
        final items = (normalized['data'] as List<dynamic>)
            .map((item) => AssetBOMItem.fromJson(item as Map<String, dynamic>))
            .toList();

        return {'status': true, 'data': items};
      }

      final decoded = json.decode(response.body);
      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to fetch BOM parts'),
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Failed to connect to the server: $e'
      };
    }
  }

  Future<Map<String, dynamic>> scanAsset(String noSO, String assetCode) async {
    try {
      final scannedValue = assetCode.trim();

      // Postman flow: check -> submit, sending AssetCode as-is (often a URL).
      final headers = await _getHeaders();
      final checkUri = Uri.parse(ApiConstants.scanAssetCheck(noSO));

      http.Response checkResponse =
          await _postJson(checkUri, headers, {'AssetCode': scannedValue});
      var checkRaw = checkResponse.body;
      var checkPreview =
          checkRaw.length > 500 ? checkRaw.substring(0, 500) : checkRaw;
      debugPrint(
          'SO scanAsset(check) => noSO=$noSO assetCode=$scannedValue url=$checkUri code=${checkResponse.statusCode} redirect=${checkResponse.isRedirect} location=${checkResponse.headers['location']} body=$checkPreview');

      if (checkResponse.isRedirect) {
        return {
          'status': false,
          'message':
              'Request di-redirect ke ${checkResponse.headers['location'] ?? '(unknown)'}. Cek baseUrl/token.',
          'statusCode': checkResponse.statusCode,
        };
      }

      final normalizedAssetCode = _normalizeScannedAssetCode(scannedValue);

      // Jika 409 pada check pertama → aset sudah di-scan, langsung return
      // tanpa retry. Jangan normalisasi kode dulu karena asetnya sudah valid
      // (hanya statusnya sudah terdaftar di SO ini).
      if (checkResponse.statusCode == 409) {
        if (_isHtmlBody(checkRaw)) {
          return {
            'status': false,
            'message': 'Server mengembalikan HTML (endpoint tidak sesuai).',
            'statusCode': checkResponse.statusCode,
          };
        }
        final checkBody409 = _tryDecodeMap(_stripBom(checkRaw));
        return {
          'status': false,
          'message': _readMessage(checkBody409, 'Asset sudah di-scan'),
          'statusCode': checkResponse.statusCode,
        };
      }

      // Untuk 400/404: coba sekali lagi dengan kode yang sudah dinormalisasi
      // (strip URL, decode hex) sebelum menyerah.
      if ((checkResponse.statusCode == 400 ||
              checkResponse.statusCode == 404) &&
          normalizedAssetCode.isNotEmpty &&
          normalizedAssetCode != scannedValue) {
        checkResponse =
            await _postJson(checkUri, headers, {'AssetCode': normalizedAssetCode});
        checkRaw = checkResponse.body;
        checkPreview =
            checkRaw.length > 500 ? checkRaw.substring(0, 500) : checkRaw;
        debugPrint(
            'SO scanAsset(check-normalized) => noSO=$noSO assetCode=$normalizedAssetCode url=$checkUri code=${checkResponse.statusCode} redirect=${checkResponse.isRedirect} location=${checkResponse.headers['location']} body=$checkPreview');
      }

      if (_isHtmlBody(checkRaw)) {
        return {
          'status': false,
          'message': 'Server mengembalikan HTML (endpoint tidak sesuai).',
          'statusCode': checkResponse.statusCode,
        };
      }

      final checkBody = _tryDecodeMap(_stripBom(checkRaw));
      if (checkResponse.statusCode != 200) {
        return {
          'status': false,
          'message': _readMessage(checkBody, 'Failed to validate asset'),
          'statusCode': checkResponse.statusCode,
        };
      }

      final dynamic data = checkBody['data'];
      String validAssetCode = normalizedAssetCode.isNotEmpty &&
              normalizedAssetCode != scannedValue
          ? normalizedAssetCode
          : scannedValue;
      String assetName = '';
      if (data is Map<String, dynamic>) {
        final code =
            (data['AssetCode'] ?? data['assetCode'] ?? '').toString().trim();
        final name =
            (data['AssetName'] ?? data['assetName'] ?? '').toString().trim();
        if (code.isNotEmpty) {
          validAssetCode = code;
        }
        if (name.isNotEmpty) {
          assetName = name;
        }
      }

      final submitUri = Uri.parse(ApiConstants.scanAssetSubmit(noSO));
      final submitResponse = await _postJson(
        submitUri,
        headers,
        {
          'AssetCode': validAssetCode,
          if (assetName.isNotEmpty) 'AssetName': assetName,
        },
      );
      final submitRaw = submitResponse.body;
      final submitPreview =
          submitRaw.length > 500 ? submitRaw.substring(0, 500) : submitRaw;
      debugPrint(
          'SO scanAsset(submit) => noSO=$noSO assetCode=$validAssetCode url=$submitUri code=${submitResponse.statusCode} redirect=${submitResponse.isRedirect} location=${submitResponse.headers['location']} body=$submitPreview');

      if (_isHtmlBody(submitRaw)) {
        return {
          'status': false,
          'message': 'Server mengembalikan HTML (endpoint tidak sesuai).',
          'statusCode': submitResponse.statusCode,
        };
      }

      final submitBody = _tryDecodeMap(_stripBom(submitRaw));
      if (submitResponse.statusCode == 200 || submitResponse.statusCode == 201) {
        return {
          'status': true,
          'message': _readMessage(submitBody, 'Asset scanned successfully'),
          'statusCode': submitResponse.statusCode,
        };
      }

      return {
        'status': false,
        'message': _readMessage(submitBody, 'Failed to submit scanned asset'),
        'statusCode': submitResponse.statusCode,
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Failed to connect to the server: $e',
        'statusCode': 0,
      };
    }
  }

  Future<Map<String, dynamic>> updateAsset({
    required String noSO,
    required String assetCode,
    required Map<String, dynamic> updateData,
  }) async {
    try {
      final response = await http.put(
        Uri.parse(ApiConstants.updateSO),
        headers: await _getHeaders(),
        body: json.encode({
          'noSO': noSO,
          'assetCode': assetCode,
          'NoSO': noSO,
          'AssetCode': assetCode,
          ...updateData,
        }),
      );

      if (response.statusCode == 200) {
        return {'status': true, 'message': 'Asset updated successfully'};
      }

      final decoded = json.decode(response.body);
      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to update asset'),
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Failed to connect to the server: $e'
      };
    }
  }

  Future<Map<String, dynamic>> updateBOM({
    required String noSO,
    required String assetCode,
    required List<Map<String, dynamic>> parts,
  }) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.updateBOM),
        headers: await _getHeaders(),
        body: json.encode({
          'noSO': noSO,
          'assetCode': assetCode,
          'data': parts,
        }),
      );

      if (response.statusCode == 200) {
        return {'status': true, 'message': 'BOM updated successfully'};
      }

      final decoded = json.decode(response.body);
      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to update BOM'),
      };
    } catch (e) {
      return {
        'status': false,
        'message': 'Failed to connect to the server: $e'
      };
    }
  }

  Future<Map<String, dynamic>> uploadImage(
    String imagePath, {
    String? noSO,
  }) async {
    try {
      final token = await _getToken();
      final request =
          http.MultipartRequest('POST', Uri.parse(ApiConstants.uploadImg));
      request.headers['Authorization'] = 'Bearer ${token ?? ''}';
      if (noSO != null && noSO.trim().isNotEmpty) {
        request.fields['noSO'] = noSO;
      }
      request.files.add(await http.MultipartFile.fromPath('image', imagePath));

      final response = await request.send();
      final responseData = await response.stream.bytesToString();
      final decoded = responseData.isNotEmpty
          ? json.decode(responseData)
          : <String, dynamic>{};

      if (response.statusCode == 200) {
        final filename =
            (decoded['filename'] ?? decoded['fileName'] ?? '').toString();
        return {'status': true, 'filename': filename};
      }

      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to upload image'),
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to upload image: $e'};
    }
  }

  Future<Map<String, dynamic>> replaceImage({
    required String oldImageName,
    required String imagePath,
    required String noSO,
  }) async {
    try {
      final token = await _getToken();
      final request =
          http.MultipartRequest('POST', Uri.parse(ApiConstants.editAssetImg));
      request.headers['Authorization'] = 'Bearer ${token ?? ''}';
      request.fields['oldImageName'] = oldImageName;
      request.fields['noSO'] = noSO;
      request.files.add(await http.MultipartFile.fromPath('image', imagePath));

      final response = await request.send();
      final responseData = await response.stream.bytesToString();
      final decoded = responseData.isNotEmpty
          ? json.decode(responseData)
          : <String, dynamic>{};

      if (response.statusCode == 200) {
        final filename =
            (decoded['filename'] ?? decoded['fileName'] ?? '').toString();
        return {'status': true, 'filename': filename};
      }

      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to replace image'),
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to replace image: $e'};
    }
  }

  Future<Map<String, dynamic>> lockStockOpname(String noSO) async {
    try {
      final response = await http.put(
        Uri.parse(ApiConstants.lockSO(noSO)),
        headers: await _getHeaders(),
      );

      if (response.statusCode == 200) {
        return {'status': true};
      }

      final decoded = json.decode(response.body);
      return {
        'status': false,
        'message': _readMessage(decoded, 'Failed to lock stock opname'),
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect: $e'};
    }
  }

  Future<Map<String, dynamic>> getMasterData() async {
    try {
      final response = await http.get(
        Uri.parse(ApiConstants.masterCompany),
        headers: await _getHeaders(withAuth: false),
      );

      if (response.statusCode != 200) {
        return {'status': false, 'message': 'Failed to fetch master data'};
      }

      final decoded = json.decode(response.body);
      if (decoded is! Map<String, dynamic>) {
        return {'status': false, 'message': 'Invalid master data format'};
      }

      final companiesJson =
          (decoded['companies'] as List<dynamic>? ?? <dynamic>[]);
      final categoriesJson =
          (decoded['categories'] as List<dynamic>? ?? <dynamic>[]);
      final locationsJson =
          (decoded['locations'] as List<dynamic>? ?? <dynamic>[]);

      return {
        'status': true,
        'companies': companiesJson
            .map((e) => Company.fromJson(e as Map<String, dynamic>))
            .toList(),
        'categories': categoriesJson
            .map((e) => Category.fromJson(e as Map<String, dynamic>))
            .toList(),
        'locations': locationsJson
            .map((e) => Location.fromJson(e as Map<String, dynamic>))
            .toList(),
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to fetch master data: $e'};
    }
  }

  Future<Map<String, dynamic>> downloadReport({
    required String noSO,
    required String tanggal,
    String? lockedDate,
    required String company,
  }) async {
    try {
      final uri = Uri.parse(ApiConstants.reportSO(noSO)).replace(
        queryParameters: {
          'tanggal': tanggal,
          'lockeddate': lockedDate ?? '',
          'perusahaan': company,
        },
      );

      final response =
          await http.get(uri, headers: await _getHeaders(withAuth: false));
      if (response.statusCode == 200) {
        return {'status': true, 'bytes': response.bodyBytes};
      }

      return {
        'status': false,
        'message': 'Failed to download report (${response.statusCode})',
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to download report: $e'};
    }
  }

  Future<Map<String, dynamic>> downloadReportBom({
    required String noSO,
    required String tanggal,
    String? lockedDate,
    required String company,
    required String location,
  }) async {
    try {
      final uri = Uri.parse(ApiConstants.reportSOBOM(noSO)).replace(
        queryParameters: {
          'tanggal': tanggal,
          'lockeddate': lockedDate ?? '',
          'perusahaan': company,
          'lokasi': location,
        },
      );

      final response =
          await http.get(uri, headers: await _getHeaders(withAuth: false));
      if (response.statusCode == 200) {
        return {'status': true, 'bytes': response.bodyBytes};
      }

      return {
        'status': false,
        'message': 'Failed to download report BOM (${response.statusCode})',
      };
    } catch (e) {
      return {'status': false, 'message': 'Failed to download report BOM: $e'};
    }
  }
}
