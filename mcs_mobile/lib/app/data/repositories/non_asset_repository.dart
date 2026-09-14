import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/not_asset_model.dart';
import '../../core/constants/api_constants.dart';

class NonAssetRepository {
  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  Future<Map<String, String>> _getHeaders() async {
    final token = await _getToken();
    return {
      'Authorization': 'Bearer ${token ?? ''}',
      'Content-Type': 'application/json',
    };
  }

  Future<Map<String, dynamic>> getNonAssetList(String noSO) async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse(ApiConstants.listNonAsset(noSO)),
        headers: headers,
      );

      if (response.statusCode == 200) {
        List<dynamic> data = json.decode(response.body);
        final list = data.map((item) => NotAsset.fromJson(item)).toList();
        return {'status': true, 'data': list};
      } else {
        final responseBody = json.decode(response.body);
        return {'status': false, 'message': responseBody['message'] ?? 'Failed to fetch non-assets'};
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> addNonAsset({
    required String noSO,
    required String nonAssetName,
    required String locationCode,
    required String remark,
    String? image,
  }) async {
    try {
      final headers = await _getHeaders();
      final body = {
        'NoSO': noSO,
        'NonAssetName': nonAssetName,
        'LocationCode': locationCode,
        'Remark': remark,
        if (image != null) 'Image': image,
      };

      final response = await http.post(
        Uri.parse(ApiConstants.addNonAsset),
        headers: headers,
        body: json.encode(body),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return {'status': true, 'message': 'Non-asset added successfully'};
      } else {
        final responseBody = json.decode(response.body);
        return {'status': false, 'message': responseBody['message'] ?? 'Failed to add non-asset'};
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> updateNonAsset({
    required int idNonAsset,
    required String nonAssetName,
    required String locationCode,
    required String remark,
    String? image,
  }) async {
    try {
      final headers = await _getHeaders();
      final body = {
        'NonAssetName': nonAssetName,
        'LocationCode': locationCode,
        'Remark': remark,
        if (image != null) 'Image': image,
      };

      final response = await http.put(
        Uri.parse(ApiConstants.updateNonAsset(idNonAsset)),
        headers: headers,
        body: json.encode(body),
      );

      if (response.statusCode == 200) {
        return {'status': true, 'message': 'Non-asset updated successfully'};
      } else {
        final responseBody = json.decode(response.body);
        return {'status': false, 'message': responseBody['message'] ?? 'Failed to update non-asset'};
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }

  Future<Map<String, dynamic>> deleteNonAssets(List<int> ids) async {
    try {
      final headers = await _getHeaders();
      final response = await http.delete(
        Uri.parse(ApiConstants.deleteNonAsset),
        headers: headers,
        body: json.encode({'ids': ids}),
      );

      if (response.statusCode == 200) {
        return {'status': true, 'message': 'Deleted successfully'};
      } else {
        final responseBody = json.decode(response.body);
        return {'status': false, 'message': responseBody['message'] ?? 'Failed to delete'};
      }
    } catch (e) {
      return {'status': false, 'message': 'Failed to connect to the server'};
    }
  }
}