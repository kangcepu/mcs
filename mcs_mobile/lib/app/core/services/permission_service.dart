import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class PermissionService {
  static Future<bool> hasAny(Iterable<String> required) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('user_data');
    if (raw == null) return false;
    try {
      final user = jsonDecode(raw);
      if (user is! Map) return false;
      if ('${user['username'] ?? ''}'.toUpperCase() == 'SUPERUSER') return true;
      final permissions = user['permissions'];
      if (permissions is! Map) return false;
      bool enabled(String key) {
        final value = permissions[key];
        return value == 1 || value == '1' || value == true;
      }

      return enabled('*') || enabled('super_admin') || required.any(enabled);
    } catch (_) {
      return false;
    }
  }
}
