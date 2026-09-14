import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../data/repositories/master_repository.dart';
import '../../../data/repositories/wo_mtc_repository.dart';
import 'asset_history_page.dart';

class WoQrScanPage extends StatefulWidget {
  const WoQrScanPage({super.key});

  @override
  State<WoQrScanPage> createState() => _WoQrScanPageState();
}

class _WoQrScanPageState extends State<WoQrScanPage> {
  final MobileScannerController _scannerController = MobileScannerController();
  final MasterRepository _masterRepository = MasterRepository();
  final WoMtcRepository _woMtcRepository = WoMtcRepository();

  bool _isProcessing = false;
  String? _lastCode;
  String _message = 'Arahkan kamera ke QR asset';
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _scannerController.dispose();
    super.dispose();
  }

  Future<void> _handleDetected(String rawValue) async {
    final value = rawValue.trim();
    if (value.isEmpty || _isProcessing || value == _lastCode) {
      return;
    }

    setState(() {
      _isProcessing = true;
      _lastCode = value;
      _message = 'Mencari data asset...';
    });

    final asset = await _masterRepository.findAssetByScanValue(value);
    if (!mounted) {
      return;
    }

    if (asset == null || asset.isEmpty) {
      setState(() {
        _message = 'Asset tidak ditemukan. Coba scan ulang.';
        _isProcessing = false;
      });
      Future.delayed(const Duration(seconds: 2), () {
        if (!mounted) {
          return;
        }
        setState(() {
          _lastCode = null;
          _message = 'Arahkan kamera ke QR asset';
        });
      });
      return;
    }

    final targets = await _loadCreateTargets();
    if (!mounted) {
      return;
    }

    await _scannerController.stop();
    if (!mounted) {
      return;
    }

    final selection = await _showTargetSelector(asset, targets);
    if (selection?.isAssetHistory == true) {
      await _showAssetHistory(asset);
    } else if (selection?.target != null) {
      _goToCreate(selection!.target!.route, asset);
      return;
    }
    if (!mounted) {
      return;
    }

    setState(() {
      _isProcessing = false;
      _lastCode = null;
      _message = 'Arahkan kamera ke QR asset';
    });
    await _scannerController.start();
  }

  Future<List<_CreateTarget>> _loadCreateTargets() async {
    final prefs = await SharedPreferences.getInstance();
    final targets = <_CreateTarget>[];

    if ((prefs.getInt('wo_it') ?? 0) == 1) {
      targets.add(const _CreateTarget('WO ITIS', '/wo/create'));
    }
    if ((prefs.getInt('wo_mtc') ?? 0) == 1) {
      targets.add(const _CreateTarget('WO MESO', '/wo_mtc/create'));
    }
    if ((prefs.getInt('wo_operational') ?? 0) == 1) {
      targets.add(const _CreateTarget('WO MTC', '/wo_operational/create'));
    }
    if ((prefs.getInt('wo_preventive') ?? 0) == 1) {
      targets
          .add(const _CreateTarget('WO Production', '/wo_production/create'));
    }

    return targets;
  }

  Future<_ScanSelection?> _showTargetSelector(
    Map<String, dynamic> asset,
    List<_CreateTarget> targets,
  ) async {
    return showModalBottomSheet<_ScanSelection>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) {
        final assetCode = (asset['AssetCode'] ?? '-').toString();
        final assetName = (asset['AssetName'] ?? '-').toString();
        final company =
            (asset['Company'] ?? asset['CompanyName'] ?? '-').toString();

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Asset Terdeteksi',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text('$assetCode - $assetName'),
                Text(
                  company,
                  style: const TextStyle(color: Colors.black54),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Aksi Asset',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.history_outlined),
                  title: const Text('Asset History'),
                  subtitle: const Text('Lihat riwayat WO mesin ini'),
                  onTap: () => Navigator.of(context)
                      .pop(const _ScanSelection.assetHistory()),
                ),
                if (targets.isNotEmpty) ...[
                  const Divider(),
                  const SizedBox(height: 4),
                  const Text(
                    'Create Work Order',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                ],
                ...targets.map((target) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.build_circle_outlined),
                      title: Text(target.label),
                      onTap: () {
                        Navigator.of(context)
                            .pop(_ScanSelection.create(target));
                      },
                    )),
              ],
            ),
          ),
        );
      },
    );
  }

  void _goToCreate(String route, Map<String, dynamic> asset) {
    Get.offNamed(
      route,
      arguments: {
        'prefill_asset': asset,
        'from_qr_scan': true,
      },
    );
  }

  Future<void> _showAssetHistory(Map<String, dynamic> asset) async {
    final idEquipment =
        (asset['id_equipment'] ?? asset['AssetID'] ?? '').toString().trim();
    if (idEquipment.isEmpty) {
      Get.snackbar(
        'Asset History',
        'ID asset tidak tersedia dari hasil scan.',
        snackPosition: SnackPosition.BOTTOM,
      );
      return;
    }

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );
      final history = await _woMtcRepository.getAssetHistory(idEquipment);
      if (Get.isDialogOpen ?? false) {
        Get.back();
      }

      await Get.to<void>(
        () => AssetHistoryPage(
          assetCode: (asset['AssetCode'] ?? '-').toString(),
          assetName: (asset['AssetName'] ?? '-').toString(),
          history: history,
        ),
      );
    } catch (error) {
      if (Get.isDialogOpen ?? false) {
        Get.back();
      }
      Get.snackbar(
        'Asset History gagal dimuat',
        error.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan QR Asset'),
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _scannerController,
            onDetect: (capture) {
              final code = capture.barcodes.isNotEmpty
                  ? capture.barcodes.first.rawValue
                  : null;
              if (code == null || code.trim().isEmpty) {
                return;
              }
              _debounce?.cancel();
              _debounce = Timer(
                const Duration(milliseconds: 350),
                () => _handleDetected(code),
              );
            },
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 24,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                _message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CreateTarget {
  final String label;
  final String route;

  const _CreateTarget(this.label, this.route);
}

class _ScanSelection {
  final bool isAssetHistory;
  final _CreateTarget? target;

  const _ScanSelection.assetHistory()
      : isAssetHistory = true,
        target = null;

  const _ScanSelection.create(this.target) : isAssetHistory = false;
}
