import 'dart:async';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';
import '../controllers/stock_opname_input_controller.dart';

class BarcodeScanPage extends StatefulWidget {
  const BarcodeScanPage({Key? key}) : super(key: key);

  @override
  State<BarcodeScanPage> createState() => _BarcodeScanPageState();
}

class _BarcodeScanPageState extends State<BarcodeScanPage> {
  late final StockOpnameInputController controller;
  final MobileScannerController scannerController = MobileScannerController(
    facing: CameraFacing.back,
    detectionSpeed: DetectionSpeed.unrestricted,
    detectionTimeoutMs: 0,
    formats: const [BarcodeFormat.qrCode],
  );

  bool _isSaving = false;
  bool _hasCameraPermission = false;
  String _message = '';
  bool _lastResultSuccess = false;
  String? _lastCode;
  Timer? _cooldown;

  late final String noSO;

  @override
  void initState() {
    super.initState();
    controller = Get.isRegistered<StockOpnameInputController>()
        ? Get.find<StockOpnameInputController>()
        : Get.put(StockOpnameInputController());

    final args = Get.arguments as Map<String, dynamic>? ?? <String, dynamic>{};
    noSO = (args['noSO'] ?? '').toString();
    _requestCameraPermission();
  }

  @override
  void dispose() {
    _cooldown?.cancel();
    scannerController.dispose();
    super.dispose();
  }

  Future<void> _requestCameraPermission() async {
    final status = await Permission.camera.request();
    if (!mounted) {
      return;
    }
    setState(() {
      _hasCameraPermission = status.isGranted;
    });
  }

  Future<void> _handleDetected(String code) async {
    if (_isSaving || code.isEmpty || code == _lastCode) {
      return;
    }

    final rawValue = code.trim();
    setState(() {
      _isSaving = true;
      _message = 'Memproses QR...';
      _lastResultSuccess = false;
      _lastCode = rawValue;
    });

    final assetCode = rawValue;
    if (!mounted) {
      return;
    }

    if (assetCode.isEmpty) {
      setState(() {
        _isSaving = false;
        _message = 'QR tidak valid (assetCode kosong)';
      });
      _cooldown?.cancel();
      _cooldown = Timer(const Duration(seconds: 2), () {
        if (!mounted) {
          return;
        }
        setState(() {
          _message = '';
          _lastCode = null;
        });
      });
      return;
    }

    final result = await controller.scanAsset(noSO, assetCode);
    if (!mounted) {
      return;
    }

    final success = result['status'] == true;
    final message = (result['message'] ?? (success ? 'Berhasil' : 'Gagal'))
        .toString()
        .trim();
    final statusCode = (result['statusCode'] ?? '').toString();

    setState(() {
      _isSaving = false;
      _lastResultSuccess = success;
      if (message.isNotEmpty) {
        _message = statusCode.isNotEmpty ? '[$statusCode] $message' : message;
      } else {
        _message = success ? 'Berhasil: $assetCode' : 'Gagal scan QR';
      }
    });

    _cooldown?.cancel();
    _cooldown = Timer(const Duration(seconds: 2), () {
      if (!mounted) {
        return;
      }
      setState(() {
        _message = '';
        _lastResultSuccess = false;
        _lastCode = null;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Obx(() => Text('Total: ${controller.totalAssetsAfter.value}')),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final scanSize =
              (constraints.maxWidth * 0.72).clamp(220.0, 320.0).toDouble();
          final centerY = constraints.maxHeight * 0.43;
          final scanRect = Rect.fromCenter(
            center: Offset(constraints.maxWidth / 2, centerY),
            width: scanSize,
            height: scanSize,
          );

          return Stack(
            children: [
              if (_hasCameraPermission)
                MobileScanner(
                  controller: scannerController,
                  scanWindow: scanRect,
                  fit: BoxFit.cover,
                  onDetect: (capture) {
                    final barcode = capture.barcodes.isNotEmpty
                        ? capture.barcodes.first.rawValue
                        : null;
                    if (barcode == null || barcode.isEmpty) {
                      return;
                    }
                    _handleDetected(barcode);
                  },
                )
              else
                Center(
                  child: ElevatedButton(
                    onPressed: _requestCameraPermission,
                    child: const Text('Aktifkan Izin Kamera'),
                  ),
                ),
              if (_hasCameraPermission)
                Positioned.fill(
                  child: IgnorePointer(
                    child: Stack(
                      children: [
                        Positioned(
                          left: 0,
                          right: 0,
                          top: 0,
                          height: scanRect.top,
                          child: Container(
                            color: Colors.black.withValues(alpha: 0.45),
                          ),
                        ),
                        Positioned(
                          left: 0,
                          width: scanRect.left,
                          top: scanRect.top,
                          height: scanRect.height,
                          child: Container(
                            color: Colors.black.withValues(alpha: 0.45),
                          ),
                        ),
                        Positioned(
                          right: 0,
                          width: constraints.maxWidth - scanRect.right,
                          top: scanRect.top,
                          height: scanRect.height,
                          child: Container(
                            color: Colors.black.withValues(alpha: 0.45),
                          ),
                        ),
                        Positioned(
                          left: 0,
                          right: 0,
                          top: scanRect.bottom,
                          bottom: 0,
                          child: Container(
                            color: Colors.black.withValues(alpha: 0.45),
                          ),
                        ),
                        Positioned.fromRect(
                          rect: scanRect,
                          child: Container(
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.white, width: 2.5),
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                        ),
                        Positioned(
                          top: scanRect.top - 34,
                          left: 0,
                          right: 0,
                          child: const Center(
                            child: Text(
                              'Posisikan QR di dalam kotak',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 28,
                child: Center(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    child: _isSaving
                        ? const CircularProgressIndicator()
                        : _message.isEmpty
                            ? const SizedBox.shrink()
                            : Container(
                                key: ValueKey<String>(_message),
                                margin:
                                    const EdgeInsets.symmetric(horizontal: 20),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: _lastResultSuccess
                                      ? Colors.green
                                      : Colors.red,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  _message,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
