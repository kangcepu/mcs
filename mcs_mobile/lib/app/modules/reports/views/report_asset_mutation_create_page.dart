import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/utils/media_picker_helper.dart';
import '../../../data/repositories/asset_mutation_repository.dart';
import '../../../data/repositories/master_repository.dart';

class ReportAssetMutationCreatePage extends StatefulWidget {
  const ReportAssetMutationCreatePage({super.key});

  @override
  State<ReportAssetMutationCreatePage> createState() =>
      _ReportAssetMutationCreatePageState();
}

class _ReportAssetMutationCreatePageState
    extends State<ReportAssetMutationCreatePage> {
  final AssetMutationRepository _repository = AssetMutationRepository();
  final MasterRepository _masterRepository = MasterRepository();

  bool _loading = true;
  bool _loadingAssets = false;
  bool _addingItem = false;
  bool _submitting = false;

  String _docNo = '';
  DateTime _date = DateTime.now();
  String? _locationBefore;
  String? _companyBefore;

  List<Map<String, dynamic>> _locations = <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _companies = <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _assets = <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _details = <Map<String, dynamic>>[];

  final DateFormat _dateFormat = DateFormat('yyyy-MM-dd');

  @override
  void initState() {
    super.initState();
    _loadMeta();
  }

  String _read(Map<String, dynamic> row, List<String> keys,
      {String fallback = '-'}) {
    for (final key in keys) {
      final value = row[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
    return fallback;
  }

  List<Map<String, dynamic>> _mapList(dynamic value) {
    if (value is! List) return <Map<String, dynamic>>[];
    return value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  String _normalizeCode(String value) {
    return value.trim().toUpperCase();
  }

  Map<String, dynamic>? _findAssetInList(
    List<Map<String, dynamic>> assets,
    String code,
  ) {
    final scanCode = _normalizeCode(code);
    if (scanCode.isEmpty) {
      return null;
    }

    for (final asset in assets) {
      final assetCode = _normalizeCode(
        _read(asset, const ['AssetCode'], fallback: ''),
      );
      if (assetCode == scanCode) {
        return asset;
      }
    }

    for (final asset in assets) {
      final assetCode = _normalizeCode(
        _read(asset, const ['AssetCode'], fallback: ''),
      );
      if (assetCode.contains(scanCode) || scanCode.contains(assetCode)) {
        return asset;
      }
    }

    return null;
  }

  Future<Map<String, dynamic>?> _scanAssetByQr() async {
    return showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: true,
      builder: (_) => _AssetMutationQrScannerDialog(
        masterRepository: _masterRepository,
      ),
    );
  }

  Future<void> _loadMeta() async {
    setState(() => _loading = true);
    try {
      final data = await _repository.getMeta();
      final locations = _mapList(data['locations']);
      final companies = _mapList(data['companies']);
      final assets = _mapList(data['assets']);

      String? locationBefore = _locationBefore;
      String? companyBefore = _companyBefore;

      locationBefore ??= locations.isNotEmpty
          ? _read(locations.first, const ['location_name'], fallback: '')
          : null;
      companyBefore ??= companies.isNotEmpty
          ? _read(companies.first, const ['company_name'], fallback: '')
          : null;

      if (!mounted) return;
      setState(() {
        _docNo = (data['document_no'] ?? '').toString();
        _locations = locations;
        _companies = companies;
        _assets = assets;
        _locationBefore = (locationBefore == null || locationBefore.isEmpty)
            ? null
            : locationBefore;
        _companyBefore = (companyBefore == null || companyBefore.isEmpty)
            ? null
            : companyBefore;
      });

      await _loadAssets();
    } catch (e) {
      Get.snackbar(
        'Error',
        e.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadAssets({String search = ''}) async {
    if ((_locationBefore ?? '').isEmpty || (_companyBefore ?? '').isEmpty) {
      setState(() => _assets = <Map<String, dynamic>>[]);
      return;
    }

    setState(() => _loadingAssets = true);
    try {
      final rows = await _repository.getAssets(
        locationBefore: _locationBefore ?? '',
        companyBefore: _companyBefore ?? '',
        search: search,
      );
      if (!mounted) return;
      setState(() => _assets = rows);
    } catch (e) {
      Get.snackbar(
        'Error',
        e.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      if (mounted) {
        setState(() => _loadingAssets = false);
      }
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() => _date = picked);
    }
  }

  Future<void> _openAddItemBottomSheet() async {
    if (_docNo.trim().isEmpty) {
      Get.snackbar('Warning', 'Document number belum tersedia.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFFF59E0B),
          colorText: Colors.white);
      return;
    }
    if ((_locationBefore ?? '').isEmpty || (_companyBefore ?? '').isEmpty) {
      Get.snackbar('Warning', 'Pilih Location Before dan Company Before dulu.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFFF59E0B),
          colorText: Colors.white);
      return;
    }
    if (_assets.isEmpty && !_loadingAssets) {
      await _loadAssets();
    }
    if (!mounted) return;

    final payload = await showModalBottomSheet<_AddMutationItemPayload>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        final purposeController = TextEditingController();
        final searchController = TextEditingController();
        Map<String, dynamic>? selectedAsset;
        String companyAfter = _companyBefore ?? '';
        String locationAfter = _locationBefore ?? '';
        List<String> attachmentPaths = <String>[];
        List<Map<String, dynamic>> shownAssets =
            List<Map<String, dynamic>>.from(_assets);
        Timer? searchDebounce;
        int searchToken = 0;

        void refreshFilter(StateSetter setSheetState) {
          final q = searchController.text.trim();
          final current = ++searchToken;

          searchDebounce?.cancel();
          searchDebounce = Timer(const Duration(milliseconds: 350), () async {
            if (!mounted || current != searchToken) return;

            if (q.isEmpty) {
              setSheetState(() {
                shownAssets = List<Map<String, dynamic>>.from(_assets);
              });
              return;
            }

            await _loadAssets(search: q);
            if (!mounted || current != searchToken) return;

            final next = List<Map<String, dynamic>>.from(_assets);
            Map<String, dynamic>? match = _findAssetInList(next, q);
            match ??= next.length == 1 ? next.first : null;

            setSheetState(() {
              shownAssets = next;
              if (match != null) {
                final assetCode =
                    _read(match, const ['AssetCode'], fallback: '').trim();
                final exactCode =
                    _normalizeCode(assetCode) == _normalizeCode(q);

                if (exactCode || next.length == 1) {
                  selectedAsset = match;
                  searchController.text = assetCode.isNotEmpty ? assetCode : q;
                }
              }
            });
          });
        }

        return StatefulBuilder(
          builder: (context, setSheetState) {
            Future<void> scanQrAsset() async {
              final scannedAsset = await _scanAssetByQr();
              if (scannedAsset == null) {
                return;
              }

              final scannedCode =
                  _read(scannedAsset, const ['AssetCode'], fallback: '');
              if (scannedCode.isEmpty) {
                Get.snackbar(
                  'Warning',
                  'QR tidak berisi Asset Code yang valid.',
                  snackPosition: SnackPosition.BOTTOM,
                  backgroundColor: const Color(0xFFF59E0B),
                  colorText: Colors.white,
                );
                return;
              }

              Map<String, dynamic>? match =
                  _findAssetInList(_assets, scannedCode);

              if (match == null) {
                final scannedLocation = _read(
                  scannedAsset,
                  const ['LocationAsset', 'location_name', 'location'],
                  fallback: '',
                );
                final scannedCompany = _read(
                  scannedAsset,
                  const ['CompanyName', 'company_name', 'company'],
                  fallback: '',
                );

                // Jika user belum menambahkan detail apa pun, ringkas flow:
                // otomatis set Location/Company Before mengikuti asset yang di-scan.
                if (_details.isEmpty &&
                    scannedLocation.trim().isNotEmpty &&
                    scannedCompany.trim().isNotEmpty &&
                    ((_locationBefore ?? '') != scannedLocation ||
                        (_companyBefore ?? '') != scannedCompany)) {
                  setState(() {
                    _locationBefore = scannedLocation.trim();
                    _companyBefore = scannedCompany.trim();
                  });

                  await _loadAssets();

                  if (!mounted) {
                    return;
                  }

                  Get.snackbar(
                    'Info',
                    'Location/Company Before otomatis disesuaikan dengan asset hasil scan.',
                    snackPosition: SnackPosition.BOTTOM,
                    backgroundColor: const Color(0xFFDBEAFE),
                    colorText: const Color(0xFF1D4ED8),
                  );

                  match = _findAssetInList(_assets, scannedCode);
                }

                try {
                  final rows = await _repository.getAssets(
                    locationBefore: _locationBefore ?? '',
                    companyBefore: _companyBefore ?? '',
                    search: scannedCode,
                    limit: 200,
                  );

                  if (!mounted) {
                    return;
                  }

                  if (rows.isNotEmpty) {
                    setState(() => _assets = rows);
                    setSheetState(
                      () => shownAssets = List<Map<String, dynamic>>.from(rows),
                    );
                    match = _findAssetInList(rows, scannedCode) ?? rows.first;
                  }
                } catch (_) {}
              }

              if (match == null) {
                Get.snackbar(
                  'Tidak ditemukan',
                  'Asset hasil scan tidak ada di scope Location/Company Before saat ini.',
                  snackPosition: SnackPosition.BOTTOM,
                  backgroundColor: const Color(0xFFF59E0B),
                  colorText: Colors.white,
                );
                return;
              }

              final picked = match;
              setSheetState(() {
                selectedAsset = picked;
                shownAssets = [picked];
                // default tujuan mengikuti pilihan terbaru (user tetap bisa ubah)
                companyAfter = (_companyBefore ?? '').trim();
                locationAfter = (_locationBefore ?? '').trim();
                searchController.text = _read(
                  picked,
                  const ['AssetCode'],
                  fallback: scannedCode,
                );
              });
            }

            Future<void> pickPhotos() async {
              final photos =
                  await MediaPickerHelper.pickMultiImageFromGallery();
              if (photos.isEmpty) return;
              setSheetState(
                  () => attachmentPaths.addAll(photos.map((f) => f.path)));
            }

            Future<void> pickVideo() async {
              final video = await MediaPickerHelper.pickVideoFromGallery();
              if (video == null) return;
              setSheetState(() => attachmentPaths.add(video.path));
            }

            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  top: 12,
                  bottom: MediaQuery.of(context).viewInsets.bottom + 14,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Add Mutation Item',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: searchController,
                              onChanged: (_) => refreshFilter(setSheetState),
                              onSubmitted: (_) {
                                if (selectedAsset != null) return;
                                if (shownAssets.isEmpty) return;
                                setSheetState(() {
                                  selectedAsset = shownAssets.first;
                                  searchController.text = _read(
                                    selectedAsset!,
                                    const ['AssetCode'],
                                    fallback: searchController.text.trim(),
                                  );
                                });
                              },
                              decoration: InputDecoration(
                                labelText: 'Cari Asset',
                                hintText: 'Asset Code / Asset Name / Alias',
                                prefixIcon: const Icon(Icons.search),
                                border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(10)),
                                suffixIcon: searchController.text.trim().isEmpty
                                    ? null
                                    : IconButton(
                                        icon: const Icon(Icons.close),
                                        onPressed: () {
                                          setSheetState(() {
                                            searchController.clear();
                                            selectedAsset = null;
                                            shownAssets =
                                                List<Map<String, dynamic>>.from(
                                                    _assets);
                                          });
                                        },
                                      ),
                                isDense: true,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton.icon(
                            onPressed: scanQrAsset,
                            icon: const Icon(Icons.qr_code_scanner, size: 16),
                            label: const Text('Scan'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (selectedAsset != null)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF0F9FF),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFBAE6FD)),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(
                                Icons.check_circle,
                                size: 18,
                                color: Color(0xFF0284C7),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _read(
                                        selectedAsset!,
                                        const ['AssetCode'],
                                        fallback: '-',
                                      ),
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xFF0C4A6E),
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      _read(
                                        selectedAsset!,
                                        const ['AssetName', 'AliasName'],
                                        fallback: '-',
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFF075985),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              TextButton(
                                onPressed: () => setSheetState(() {
                                  selectedAsset = null;
                                }),
                                child: const Text('Ganti'),
                              ),
                            ],
                          ),
                        )
                      else
                        Container(
                          constraints: const BoxConstraints(maxHeight: 180),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFE5E7EB)),
                          ),
                          child: shownAssets.isEmpty
                              ? const Center(
                                  child: Padding(
                                    padding: EdgeInsets.all(14),
                                    child: Text(
                                      'Asset tidak ditemukan.',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFF6B7280),
                                      ),
                                    ),
                                  ),
                                )
                              : ListView.separated(
                                  itemCount: shownAssets.length,
                                  separatorBuilder: (_, __) =>
                                      const Divider(height: 1),
                                  itemBuilder: (_, index) {
                                    final asset = shownAssets[index];
                                    final code =
                                        _read(asset, const ['AssetCode']);
                                    final name =
                                        _read(asset, const ['AssetName']);
                                    final subtitle = '${_read(asset, const [
                                          'LocationAsset'
                                        ])} | ${_read(asset, const [
                                          'CompanyName'
                                        ])}';

                                    return ListTile(
                                      dense: true,
                                      title: Text(
                                        code,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      subtitle: Text(
                                        '$name\n$subtitle',
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 11),
                                      ),
                                      isThreeLine: true,
                                      onTap: () => setSheetState(() {
                                        selectedAsset = asset;
                                        searchController.text = _read(
                                          asset,
                                          const ['AssetCode'],
                                          fallback:
                                              searchController.text.trim(),
                                        );
                                      }),
                                    );
                                  },
                                ),
                        ),
                      const SizedBox(height: 10),
                      _readonlyField(
                        label: 'Asset Name',
                        value: selectedAsset == null
                            ? ''
                            : _read(selectedAsset!, const ['AssetName'],
                                fallback: ''),
                      ),
                      const SizedBox(height: 8),
                      _readonlyField(
                        label: 'Alias Name',
                        value: selectedAsset == null
                            ? ''
                            : _read(selectedAsset!, const ['AliasName'],
                                fallback: ''),
                      ),
                      const SizedBox(height: 8),
                      _readonlyField(
                        label: 'Category',
                        value: selectedAsset == null
                            ? ''
                            : _read(selectedAsset!, const ['CategoryAsset'],
                                fallback: ''),
                      ),
                      const SizedBox(height: 10),
                      DropdownButtonFormField<String>(
                        initialValue:
                            companyAfter.isEmpty ? null : companyAfter,
                        decoration: InputDecoration(
                          labelText: 'Company After',
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10)),
                          isDense: true,
                        ),
                        items: _companies
                            .map((r) =>
                                _read(r, const ['company_name'], fallback: ''))
                            .where((name) => name.isNotEmpty)
                            .map((name) => DropdownMenuItem<String>(
                                  value: name,
                                  child: Text(name,
                                      style: const TextStyle(fontSize: 13)),
                                ))
                            .toList(),
                        onChanged: (value) => setSheetState(
                            () => companyAfter = (value ?? '').trim()),
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        initialValue:
                            locationAfter.isEmpty ? null : locationAfter,
                        decoration: InputDecoration(
                          labelText: 'Location After',
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10)),
                          isDense: true,
                        ),
                        items: _locations
                            .map((r) =>
                                _read(r, const ['location_name'], fallback: ''))
                            .where((name) => name.isNotEmpty)
                            .map((name) => DropdownMenuItem<String>(
                                  value: name,
                                  child: Text(name,
                                      style: const TextStyle(fontSize: 13)),
                                ))
                            .toList(),
                        onChanged: (value) => setSheetState(
                            () => locationAfter = (value ?? '').trim()),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: purposeController,
                        minLines: 2,
                        maxLines: 4,
                        decoration: InputDecoration(
                          labelText: 'Mutation Purpose',
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            onPressed: pickPhotos,
                            icon: const Icon(Icons.photo_library_outlined,
                                size: 16),
                            label: const Text('Foto'),
                          ),
                          OutlinedButton.icon(
                            onPressed: pickVideo,
                            icon: const Icon(Icons.video_library_outlined,
                                size: 16),
                            label: const Text('Video'),
                          ),
                        ],
                      ),
                      if (attachmentPaths.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children:
                              attachmentPaths.asMap().entries.map((entry) {
                            final idx = entry.key;
                            final name =
                                entry.value.split(RegExp(r'[\\/]')).last;
                            return InputChip(
                              label: Text(name,
                                  style: const TextStyle(fontSize: 11)),
                              onDeleted: () => setSheetState(
                                  () => attachmentPaths.removeAt(idx)),
                            );
                          }).toList(),
                        ),
                      ],
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () {
                            if (selectedAsset == null) {
                              Get.snackbar(
                                  'Warning', 'Pilih asset terlebih dahulu.',
                                  snackPosition: SnackPosition.BOTTOM,
                                  backgroundColor: const Color(0xFFF59E0B),
                                  colorText: Colors.white);
                              return;
                            }
                            if (companyAfter.trim().isEmpty ||
                                locationAfter.trim().isEmpty ||
                                purposeController.text.trim().isEmpty) {
                              Get.snackbar(
                                'Warning',
                                'Company After, Location After, dan Purpose wajib diisi.',
                                snackPosition: SnackPosition.BOTTOM,
                                backgroundColor: const Color(0xFFF59E0B),
                                colorText: Colors.white,
                              );
                              return;
                            }
                            Navigator.of(sheetContext)
                                .pop(_AddMutationItemPayload(
                              asset: selectedAsset!,
                              companyAfter: companyAfter.trim(),
                              locationAfter: locationAfter.trim(),
                              purpose: purposeController.text.trim(),
                              attachmentPaths:
                                  List<String>.from(attachmentPaths),
                            ));
                          },
                          icon: const Icon(Icons.save_alt),
                          label: const Text('Simpan Item'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    if (payload != null) {
      await _addDetail(payload);
    }
  }

  Future<void> _addDetail(_AddMutationItemPayload payload) async {
    if (_addingItem) return;
    setState(() => _addingItem = true);
    try {
      final result = await _repository.addDetail(
        docNo: _docNo,
        assetId: int.tryParse(
                _read(payload.asset, const ['AssetID'], fallback: '0')) ??
            0,
        assetCode: _read(payload.asset, const ['AssetCode'], fallback: ''),
        assetName: _read(payload.asset, const ['AssetName'], fallback: ''),
        aliasName: _read(payload.asset, const ['AliasName'], fallback: ''),
        category: _read(payload.asset, const ['CategoryAsset'], fallback: ''),
        companyAfter: payload.companyAfter,
        locationAfter: payload.locationAfter,
        mutationPurpose: payload.purpose,
        attachmentPaths: payload.attachmentPaths,
      );
      final details = _mapList(result['details']);
      if (!mounted) return;
      setState(() => _details = details);
      Get.snackbar('Success', 'Item berhasil ditambahkan.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFF16A34A),
          colorText: Colors.white);
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      if (mounted) {
        setState(() => _addingItem = false);
      }
    }
  }

  Future<void> _deleteDetail(Map<String, dynamic> row) async {
    final id = int.tryParse(_read(row, const ['id'], fallback: '0')) ?? 0;
    if (id <= 0) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Hapus Item'),
        content: const Text('Yakin hapus item mutation ini?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final ok = await _repository.deleteDetail(id);
      if (!ok || !mounted) return;
      setState(() {
        _details.removeWhere((item) {
          final itemId =
              int.tryParse(_read(item, const ['id'], fallback: '0')) ?? 0;
          return itemId == id;
        });
      });
      Get.snackbar('Success', 'Item berhasil dihapus.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFF16A34A),
          colorText: Colors.white);
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    }
  }

  Future<void> _submit() async {
    if (_submitting) return;

    if ((_locationBefore ?? '').isEmpty || (_companyBefore ?? '').isEmpty) {
      Get.snackbar(
          'Warning', 'Location Before dan Company Before wajib dipilih.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFFF59E0B),
          colorText: Colors.white);
      return;
    }
    if (_details.isEmpty) {
      Get.snackbar('Warning', 'Tambahkan minimal 1 item mutation.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFFF59E0B),
          colorText: Colors.white);
      return;
    }

    setState(() => _submitting = true);
    try {
      final ok = await _repository.submitRequest(
        docNo: _docNo,
        date: _dateFormat.format(_date),
        locationBefore: _locationBefore ?? '',
        companyBefore: _companyBefore ?? '',
      );
      if (!ok) return;
      Get.snackbar('Success', 'Mutation request berhasil disubmit.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFF16A34A),
          colorText: Colors.white);
      Get.back(result: true);
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Widget _readonlyField({required String label, required String value}) {
    final controller = TextEditingController(text: value);
    return TextField(
      readOnly: true,
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        isDense: true,
      ),
    );
  }

  Widget _headerCard() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                  child: _readonlyField(label: 'Document No', value: _docNo)),
              const SizedBox(width: 10),
              Expanded(
                child: InkWell(
                  onTap: _pickDate,
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Date',
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10)),
                      isDense: true,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(_dateFormat.format(_date),
                              style: const TextStyle(fontSize: 13)),
                        ),
                        const Icon(Icons.calendar_month_outlined, size: 18),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue:
                      (_locationBefore ?? '').isEmpty ? null : _locationBefore,
                  decoration: InputDecoration(
                    labelText: 'Location Before',
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10)),
                    isDense: true,
                  ),
                  items: _locations
                      .map((r) =>
                          _read(r, const ['location_name'], fallback: ''))
                      .where((name) => name.isNotEmpty)
                      .map((name) => DropdownMenuItem<String>(
                          value: name, child: Text(name)))
                      .toList(),
                  onChanged: (value) async {
                    setState(() => _locationBefore = (value ?? '').trim());
                    await _loadAssets();
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue:
                      (_companyBefore ?? '').isEmpty ? null : _companyBefore,
                  decoration: InputDecoration(
                    labelText: 'Company Before',
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10)),
                    isDense: true,
                  ),
                  items: _companies
                      .map(
                          (r) => _read(r, const ['company_name'], fallback: ''))
                      .where((name) => name.isNotEmpty)
                      .map((name) => DropdownMenuItem<String>(
                          value: name, child: Text(name)))
                      .toList(),
                  onChanged: (value) async {
                    setState(() => _companyBefore = (value ?? '').trim());
                    await _loadAssets();
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _detailCard(Map<String, dynamic> row) {
    final attachments = _mapList(row['attachments']);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(_read(row, const ['AssetCode']),
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w800)),
              ),
              IconButton(
                onPressed: () => _deleteDetail(row),
                icon: const Icon(Icons.delete_outline, color: Colors.red),
              ),
            ],
          ),
          Text(_read(row, const ['AssetName']),
              style:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Company After: ${_read(row, const ['company_after'])}',
              style: const TextStyle(fontSize: 12)),
          Text('Location After: ${_read(row, const ['location_after'])}',
              style: const TextStyle(fontSize: 12)),
          Text('Purpose: ${_read(row, const ['mutation_purpose'])}',
              style: const TextStyle(fontSize: 12)),
          if (attachments.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: attachments.map((att) {
                final fileName =
                    _read(att, const ['file_name'], fallback: 'file');
                return Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(fileName,
                      style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xFF1D4ED8),
                          fontWeight: FontWeight.w600)),
                );
              }).toList(),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Mutation Request'),
        actions: [
          if (_loadingAssets)
            const Padding(
              padding: EdgeInsets.only(right: 14),
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                ),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _headerCard(),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text('Detail Items (${_details.length})',
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800)),
              ),
              ElevatedButton.icon(
                onPressed: _addingItem ? null : _openAddItemBottomSheet,
                icon: _addingItem
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add, size: 16),
                label: Text(_addingItem ? 'Menyimpan...' : 'Add Item'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (_details.isEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFFDE68A)),
              ),
              child: const Text(
                'Belum ada item. Tap Add Item untuk menambah mutation detail.',
                style: TextStyle(fontSize: 12, color: Color(0xFF92400E)),
              ),
            )
          else
            ..._details.map(_detailCard),
          const SizedBox(height: 12),
          SizedBox(
            height: 46,
            child: ElevatedButton.icon(
              onPressed: _submitting ? null : _submit,
              icon: _submitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send),
              label: Text(_submitting ? 'Submitting...' : 'Submit Request'),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddMutationItemPayload {
  final Map<String, dynamic> asset;
  final String companyAfter;
  final String locationAfter;
  final String purpose;
  final List<String> attachmentPaths;

  const _AddMutationItemPayload({
    required this.asset,
    required this.companyAfter,
    required this.locationAfter,
    required this.purpose,
    required this.attachmentPaths,
  });
}

class _AssetMutationQrScannerDialog extends StatefulWidget {
  final MasterRepository masterRepository;

  const _AssetMutationQrScannerDialog({
    required this.masterRepository,
  });

  @override
  State<_AssetMutationQrScannerDialog> createState() =>
      _AssetMutationQrScannerDialogState();
}

class _AssetMutationQrScannerDialogState
    extends State<_AssetMutationQrScannerDialog> {
  final MobileScannerController _scannerController = MobileScannerController(
    facing: CameraFacing.back,
    detectionSpeed: DetectionSpeed.unrestricted,
    detectionTimeoutMs: 0,
    formats: const [BarcodeFormat.qrCode],
  );

  bool _processing = false;
  String _message = 'Arahkan QR asset ke dalam kotak';
  String? _lastCode;
  Timer? _cooldown;

  @override
  void dispose() {
    _cooldown?.cancel();
    _scannerController.dispose();
    super.dispose();
  }

  Future<void> _handleDetect(String rawValue) async {
    final value = rawValue.trim();
    if (value.isEmpty || _processing || value == _lastCode) {
      return;
    }

    setState(() {
      _processing = true;
      _lastCode = value;
      _message = 'Mencari data asset...';
    });

    final asset = await widget.masterRepository.findAssetByScanValue(value);
    if (!mounted) {
      return;
    }

    if (asset == null || asset.isEmpty) {
      setState(() {
        _processing = false;
        _message = 'Asset tidak ditemukan. Coba scan ulang.';
      });
      _cooldown?.cancel();
      _cooldown = Timer(const Duration(seconds: 2), () {
        if (!mounted) {
          return;
        }
        setState(() {
          _lastCode = null;
          _message = 'Arahkan QR asset ke dalam kotak';
        });
      });
      return;
    }

    Navigator.of(context).pop(Map<String, dynamic>.from(asset));
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.all(16),
      child: SizedBox(
        width: double.infinity,
        height: 430,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Scan QR Asset',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final size =
                      (constraints.maxWidth * 0.72).clamp(200.0, 280.0);
                  final scanRect = Rect.fromCenter(
                    center: Offset(
                        constraints.maxWidth / 2, constraints.maxHeight / 2),
                    width: size,
                    height: size,
                  );

                  return Stack(
                    children: [
                      MobileScanner(
                        controller: _scannerController,
                        scanWindow: scanRect,
                        fit: BoxFit.cover,
                        onDetect: (capture) {
                          final value = capture.barcodes.isNotEmpty
                              ? capture.barcodes.first.rawValue
                              : null;
                          if (value == null || value.trim().isEmpty) {
                            return;
                          }
                          _handleDetect(value);
                        },
                      ),
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
                                  color: Colors.black.withValues(alpha: 0.42),
                                ),
                              ),
                              Positioned(
                                left: 0,
                                width: scanRect.left,
                                top: scanRect.top,
                                height: scanRect.height,
                                child: Container(
                                  color: Colors.black.withValues(alpha: 0.42),
                                ),
                              ),
                              Positioned(
                                right: 0,
                                width: constraints.maxWidth - scanRect.right,
                                top: scanRect.top,
                                height: scanRect.height,
                                child: Container(
                                  color: Colors.black.withValues(alpha: 0.42),
                                ),
                              ),
                              Positioned(
                                left: 0,
                                right: 0,
                                top: scanRect.bottom,
                                bottom: 0,
                                child: Container(
                                  color: Colors.black.withValues(alpha: 0.42),
                                ),
                              ),
                              Positioned.fromRect(
                                rect: scanRect,
                                child: Container(
                                  decoration: BoxDecoration(
                                    border: Border.all(
                                      color: Colors.white,
                                      width: 2.5,
                                    ),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 12,
                        right: 12,
                        bottom: 12,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.62),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            _message,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
