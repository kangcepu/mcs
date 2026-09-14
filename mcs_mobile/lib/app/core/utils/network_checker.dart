import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

class NetworkChecker {
  // Defaults (used when .env keys are missing).
  // Keep these aligned with the environment your users can actually reach.
  static const _defaultMcsBasePublic = 'https://mcs.padmoasm.com/api';
  static const _defaultMcsBaseLocal = 'http://192.168.10.100:8888/mcs/api';
  static const _defaultMcsWebBasePublic = 'https://mcs.padmoasm.com';
  static const _defaultMcsWebBaseLocal = 'http://192.168.10.100:8888/mcs';

  static const _defaultSoBasePublic = 'https://so.padmoasm.com';
  static const _defaultSoBaseLocal = 'http://192.168.10.100:6000';
  static const _defaultSoWsPublic = 'wss://so.padmoasm.com';
  static const _defaultSoWsLocal = 'ws://192.168.10.100:6000';

  static const _defaultMaterialBasePublic =
      'https://mcs.padmoasm.com/_svc8989/microserviceLive/material';
  static const _defaultMaterialBaseLocal =
      'http://192.168.10.100:8989/microserviceLive/material';

  static const _probeTimeout = Duration(milliseconds: 1200);
  static const _allowedPublicHosts = {
    'vpn.utamacorp.com',
    'mcs.padmoasm.com',
    'so.padmoasm.com',
  };

  static String? _selectedSoBaseUrl;
  static final Map<String, bool> _reachabilityByOrigin = {};

  static Future<String> getBaseUrl() async {
    final baseUrl = await _resolveHttpEndpoint(
      label: 'API',
      primaryKey: 'MCS_BASE_URL',
      localKey: 'MCS_BASE_URL_LOCAL',
      publicKey: 'MCS_BASE_URL_PUBLIC',
      defaultLocal: _defaultMcsBaseLocal,
      defaultPublic: _defaultMcsBasePublic,
    );
    debugPrint('API selected: $baseUrl');
    return baseUrl;
  }

  static Future<String> getWebBaseUrl() async {
    final webBaseUrl = await _resolveHttpEndpoint(
      label: 'WEB',
      primaryKey: 'MCS_WEB_BASE_URL',
      localKey: 'MCS_WEB_BASE_URL_LOCAL',
      publicKey: 'MCS_WEB_BASE_URL_PUBLIC',
      defaultLocal: _defaultMcsWebBaseLocal,
      defaultPublic: _defaultMcsWebBasePublic,
    );
    debugPrint('WEB selected: $webBaseUrl');
    return webBaseUrl;
  }

  static Future<String> getSoBaseUrl() async {
    final soBaseUrl = await _resolveHttpEndpoint(
      label: 'SO',
      primaryKey: 'API_BASE_URL',
      localKey: 'API_BASE_URL_LOCAL',
      publicKey: 'API_BASE_URL_PUBLIC',
      defaultLocal: _defaultSoBaseLocal,
      defaultPublic: _defaultSoBasePublic,
    );
    _selectedSoBaseUrl = soBaseUrl;
    debugPrint('SO selected: $soBaseUrl');
    return soBaseUrl;
  }

  static Future<String> getSoWsUrl() async {
    final autoDetect = _isAutoDetectEnabled();
    final wsDirect = _fromEnv('WS_BASE_URL');
    final wsPublic = _fromEnv('WS_BASE_URL_PUBLIC') ?? _defaultSoWsPublic;
    final wsLocal = _fromEnv('WS_BASE_URL_LOCAL') ?? _defaultSoWsLocal;

    final candidates = _sanitizeCandidates([
      if (wsDirect != null) wsDirect,
      wsPublic,
      wsLocal,
    ]);

    if (candidates.isEmpty) {
      debugPrint('SO WS selected (fallback): $_defaultSoWsPublic');
      return _defaultSoWsPublic;
    }

    if (!autoDetect) {
      debugPrint('SO WS selected (manual): ${candidates.first}');
      return candidates.first;
    }

    final soHost = Uri.tryParse(_selectedSoBaseUrl ?? '')?.host.toLowerCase();
    if (soHost != null && soHost.isNotEmpty) {
      for (final wsUrl in candidates) {
        final wsHost = Uri.tryParse(wsUrl)?.host.toLowerCase();
        if (wsHost == soHost) {
          debugPrint('SO WS selected (host-matched): $wsUrl');
          return wsUrl;
        }
      }
    }

    debugPrint('SO WS selected (auto): ${candidates.first}');
    return candidates.first;
  }

  static Future<String> getMaterialBaseUrl() async {
    final materialBaseUrl = await _resolveHttpEndpoint(
      label: 'MATERIAL',
      primaryKey: 'MATERIAL_BASE_URL',
      localKey: 'MATERIAL_BASE_URL_LOCAL',
      publicKey: 'MATERIAL_BASE_URL_PUBLIC',
      defaultLocal: _defaultMaterialBaseLocal,
      defaultPublic: _defaultMaterialBasePublic,
    );
    debugPrint('Material API selected: $materialBaseUrl');
    return materialBaseUrl;
  }

  static Future<String> _resolveHttpEndpoint({
    required String label,
    required String primaryKey,
    required String localKey,
    required String publicKey,
    required String defaultLocal,
    required String defaultPublic,
  }) async {
    final autoDetect = _isAutoDetectEnabled();
    final primary = _fromEnv(primaryKey);

    final candidates = _sanitizeCandidates([
      if (primary != null) primary,
      _fromEnv(localKey) ?? defaultLocal,
      _fromEnv(publicKey) ?? defaultPublic,
    ]);

    if (candidates.isEmpty) {
      return defaultPublic;
    }

    if (!autoDetect) {
      return candidates.first;
    }

    for (final endpoint in candidates) {
      final reachable = await _isHttpReachable(endpoint);
      if (reachable) {
        debugPrint('$label endpoint reachable: $endpoint');
        return endpoint;
      }
    }

    final publicCandidate = candidates.firstWhere(
      (value) {
        final host = Uri.tryParse(value)?.host.toLowerCase();
        return host != null && _allowedPublicHosts.contains(host);
      },
      orElse: () => candidates.first,
    );

    debugPrint(
        '$label endpoint fallback to public candidate: $publicCandidate');
    return publicCandidate;
  }

  static bool _isAutoDetectEnabled() {
    final raw = dotenv.maybeGet('AUTO_DETECT_NETWORK')?.trim().toLowerCase();
    if (raw == null || raw.isEmpty) {
      return true;
    }

    return raw == '1' || raw == 'true' || raw == 'yes' || raw == 'on';
  }

  static Future<bool> _isHttpReachable(String endpoint) async {
    final uri = Uri.tryParse(endpoint);
    if (uri == null) {
      return false;
    }

    final origin = _buildOrigin(uri);
    final cached = _reachabilityByOrigin[origin];
    if (cached != null) {
      return cached;
    }

    final probeUri = uri.replace(
      path: uri.path.isEmpty ? '/' : uri.path,
      query: null,
      fragment: null,
    );

    final client = HttpClient()..connectionTimeout = _probeTimeout;
    try {
      final request =
          await client.openUrl('HEAD', probeUri).timeout(_probeTimeout);
      request.followRedirects = false;
      final response = await request.close().timeout(_probeTimeout);
      await response.drain<void>();
      _reachabilityByOrigin[origin] = true;
      return true;
    } catch (_) {
      try {
        final request = await client.getUrl(probeUri).timeout(_probeTimeout);
        request.followRedirects = false;
        final response = await request.close().timeout(_probeTimeout);
        await response.drain<void>();
        _reachabilityByOrigin[origin] = true;
        return true;
      } catch (_) {
        _reachabilityByOrigin[origin] = false;
        return false;
      }
    } finally {
      client.close(force: true);
    }
  }

  static String _buildOrigin(Uri uri) {
    final port = uri.hasPort
        ? uri.port
        : uri.scheme.toLowerCase() == 'https'
            ? 443
            : 80;
    return '${uri.scheme.toLowerCase()}://${uri.host.toLowerCase()}:$port';
  }

  static String? _fromEnv(String key) {
    final value = dotenv.maybeGet(key)?.trim();
    if (value == null || value.isEmpty) {
      return null;
    }

    final uri = Uri.tryParse(value);
    if (uri == null || uri.host.isEmpty || !_isAllowedHost(uri.host)) {
      debugPrint('Ignoring endpoint outside allowlist for $key: $value');
      return null;
    }

    return value;
  }

  static List<String> _sanitizeCandidates(List<String> values) {
    final result = <String>[];
    final seen = <String>{};

    for (final value in values) {
      final uri = Uri.tryParse(value);
      if (uri == null || uri.host.isEmpty || !_isAllowedHost(uri.host)) {
        continue;
      }
      if (seen.add(value)) {
        result.add(value);
      }
    }

    return result;
  }

  static bool _isAllowedHost(String host) {
    final normalized = host.trim().toLowerCase();
    if (normalized.isEmpty) {
      return false;
    }

    if (_isLocalHost(normalized)) {
      return true;
    }

    return _allowedPublicHosts.contains(normalized);
  }

  static bool _isLocalHost(String host) {
    final normalized = host.trim().toLowerCase();
    if (normalized.isEmpty) {
      return false;
    }

    if (normalized == 'localhost' ||
        normalized == '127.0.0.1' ||
        normalized == '::1' ||
        normalized == '10.0.2.2') {
      return true;
    }

    final segments = normalized.split('.');
    if (segments.length != 4) {
      return false;
    }

    final octets = <int>[];
    for (final segment in segments) {
      final value = int.tryParse(segment);
      if (value == null || value < 0 || value > 255) {
        return false;
      }
      octets.add(value);
    }

    final a = octets[0];
    final b = octets[1];

    final is10Range = a == 10;
    final is172Range = a == 172 && b >= 16 && b <= 31;
    final is192Range = a == 192 && b == 168;

    return is10Range || is172Range || is192Range;
  }
}
