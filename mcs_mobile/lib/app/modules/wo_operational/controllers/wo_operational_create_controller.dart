import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../data/repositories/master_repository.dart';
import '../../../data/repositories/wo_operational_repository.dart';

class WoOperationalCreateController extends GetxController {
  final WoOperationalRepository _woRepository = WoOperationalRepository();
  final MasterRepository _masterRepository = MasterRepository();
  final ImagePicker _picker = ImagePicker();

  final formKey = GlobalKey<FormState>();

  final woNumberController = TextEditingController();
  final dateController = TextEditingController();
  final companyController = TextEditingController();
  final jobTitleController = TextEditingController();
  final runningHoursController = TextEditingController();
  final jobRequirementController = TextEditingController();

  final isLoading = false.obs;
  final isLoadingMaster = true.obs;
  final isGeneratingNumber = false.obs;
  final isSubmitting = false.obs;

  final selectedDivision = Rx<Map<String, dynamic>?>(null);
  final selectedAsset = Rx<Map<String, dynamic>?>(null);
  final selectedTypeWo = ''.obs;
  final selectedPriority = ''.obs;
  final selectedShift = 'regular'.obs;

  final divisions = <Map<String, dynamic>>[].obs;
  final assets = <Map<String, dynamic>>[].obs;
  final woTypes = <Map<String, dynamic>>[].obs;
  final priorities = <Map<String, dynamic>>[].obs;

  final selectedImages = <File>[].obs;
  Map<String, dynamic>? _prefillAsset;

  @override
  void onInit() {
    super.onInit();
    dateController.text = DateTime.now().toString().split(' ')[0];
    woNumberController.text = '(Auto Generate)';

    final args = Get.arguments;
    if (args is Map && args['prefill_asset'] != null) {
      _prefillAsset = _normalizeAssetMap(args['prefill_asset']);
    }

    ever(selectedAsset, (asset) {
      if (asset != null) {
        final company = asset['Company'] ?? asset['CompanyName'];
        if (company != null && company.toString().trim().isNotEmpty) {
          companyController.text = company.toString();
        }
      }
    });

    loadMasterDataThenUserDivision();
  }

  @override
  void onClose() {
    woNumberController.dispose();
    dateController.dispose();
    companyController.dispose();
    jobTitleController.dispose();
    runningHoursController.dispose();
    jobRequirementController.dispose();
    super.onClose();
  }

  Future<void> loadMasterDataThenUserDivision() async {
    isLoadingMaster.value = true;
    try {
      await Future.wait([
        loadWoTypes(),
        loadPriorities(),
        loadDivisions(),
      ]);

      if (selectedTypeWo.value.isEmpty && woTypes.isNotEmpty) {
        selectedTypeWo.value = (woTypes.first['code'] ?? '').toString();
      }

      if (selectedPriority.value.isEmpty && priorities.isNotEmpty) {
        selectedPriority.value = (priorities.first['code'] ?? '').toString();
      }

      await loadUserDivision();
    } finally {
      isLoadingMaster.value = false;
    }
  }

  Future<void> loadDivisions() async {
    try {
      final result = await _masterRepository.getDivisions();
      divisions.value = result;
    } catch (e) {
      debugPrint('Error loading divisions: $e');
    }
  }

  Future<void> loadWoTypes() async {
    try {
      final result = await _masterRepository.getWoTypes();
      final mapped = <Map<String, dynamic>>[];
      final usedCode = <String>{};

      for (final item in result) {
        final rawCode = (item['code'] ?? '').toString();
        final normalizedCode = _normalizeTypeCode(rawCode);
        if (normalizedCode.isEmpty || usedCode.contains(normalizedCode)) {
          continue;
        }

        usedCode.add(normalizedCode);
        mapped.add({
          'code': normalizedCode,
          'label': _formatTypeLabel(
            normalizedCode,
            fallback: (item['label'] ?? rawCode).toString(),
          ),
        });
      }

      if (mapped.isNotEmpty) {
        woTypes.value = mapped;
        return;
      }
    } catch (e) {
      debugPrint('Error loading WO types: $e');
    }

    woTypes.value = const [
      {'code': 'corrective', 'label': 'Corrective'},
      {'code': 'preventive', 'label': 'Preventive'},
      {'code': 'project', 'label': 'Project'},
    ];
  }

  Future<void> loadPriorities() async {
    try {
      final result = await _masterRepository.getPriorities();
      if (result.isNotEmpty) {
        priorities.value = result;
        return;
      }
    } catch (e) {
      debugPrint('Error loading priorities: $e');
    }

    priorities.value = const [
      {'code': 'NORMAL', 'label': 'Normal'},
      {'code': 'EMERGENCY', 'label': 'Emergency'},
    ];
  }

  Future<void> loadAssets() async {
    try {
      final result = await _masterRepository.getAssets();
      assets.value = result;
    } catch (e) {
      debugPrint('Error loading assets: $e');
      assets.clear();
    }
  }

  Future<void> loadUserDivision() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final divisionCode = (prefs.getString('division_code') ?? '').trim();
      final divisionName = (prefs.getString('division_name') ?? '').trim();
      final divisionId = (prefs.getString('id_division') ??
              prefs.getString('division_id') ??
              '')
          .trim();

      if (divisionCode.isNotEmpty) {
        final matchedDivision = divisions.firstWhereOrNull(
          (div) =>
              (div['division_code'] ?? '').toString().trim().toUpperCase() ==
              divisionCode.toUpperCase(),
        );

        if (matchedDivision != null) {
          selectedDivision.value = matchedDivision;
        } else {
          selectedDivision.value = {
            'division_code': divisionCode,
            'division_name': divisionName,
            'id_division': divisionId,
          };
        }
      }

      await loadAssets();
      _applyPrefillAssetIfNeeded();
      await generateWoNumber();
    } catch (e) {
      debugPrint('Error loading user division: $e');
      await loadAssets();
      _applyPrefillAssetIfNeeded();
      await generateWoNumber();
    }
  }

  Future<void> generateWoNumber() async {
    try {
      isGeneratingNumber.value = true;
      final woNumber = await _woRepository.getNewWoNumber();
      woNumberController.text =
          woNumber.trim().isEmpty ? '(Auto Generate)' : woNumber.trim();
    } catch (e) {
      debugPrint('Error generating WO number: $e');
      woNumberController.text = '(Auto Generate)';
      Get.snackbar(
        'Info',
        'WO Number akan di-generate otomatis saat submit',
        snackPosition: SnackPosition.BOTTOM,
      );
    } finally {
      isGeneratingNumber.value = false;
    }
  }

  Map<String, dynamic>? _normalizeAssetMap(dynamic raw) {
    if (raw == null) {
      return null;
    }

    Map<String, dynamic> map;
    if (raw is Map<String, dynamic>) {
      map = Map<String, dynamic>.from(raw);
    } else if (raw is Map) {
      map = Map<String, dynamic>.from(raw);
    } else {
      return null;
    }

    final company = map['Company'] ?? map['CompanyName'];
    if (company != null) {
      map['Company'] = company.toString();
    }

    if (map['AssetID'] == null && map['id_equipment'] != null) {
      map['AssetID'] = map['id_equipment'];
    }
    if (map['id_equipment'] == null && map['AssetID'] != null) {
      map['id_equipment'] = map['AssetID'];
    }

    return map;
  }

  void _applyPrefillAssetIfNeeded() {
    final prefill = _prefillAsset;
    if (prefill == null) {
      return;
    }

    final prefillId = (prefill['AssetID'] ?? '').toString();
    final prefillCode = (prefill['AssetCode'] ?? '').toString().toUpperCase();
    Map<String, dynamic>? matched;

    for (final asset in assets) {
      final assetId = (asset['AssetID'] ?? '').toString();
      final assetCode = (asset['AssetCode'] ?? '').toString().toUpperCase();
      if ((prefillId.isNotEmpty && assetId == prefillId) ||
          (prefillCode.isNotEmpty && assetCode == prefillCode)) {
        matched = asset;
        break;
      }
    }

    final selected = matched ?? prefill;
    if (matched == null) {
      final exists = assets.any((asset) =>
          (asset['AssetID'] ?? '').toString() ==
          (selected['AssetID'] ?? '').toString());
      if (!exists) {
        assets.insert(0, selected);
      }
    }

    selectedAsset.value = selected;
    _prefillAsset = null;
  }

  String _normalizeTypeCode(String rawCode) {
    final normalized = rawCode.trim().toUpperCase();
    if (normalized.isEmpty) {
      return '';
    }

    if (const [
      'PREVENTIVE',
      'PREVENTIVE MAINTENANCE',
      'PREV MAINTENANCE',
      'PM',
    ].contains(normalized)) {
      return 'preventive';
    }

    if (const ['CORRECTIVE', 'CORRECTIVE MAINTENANCE', 'CM']
        .contains(normalized)) {
      return 'corrective';
    }

    if (normalized == 'PROJECT') {
      return 'project';
    }

    return rawCode.trim();
  }

  String _formatTypeLabel(String code, {String fallback = ''}) {
    final normalized = code.trim().toLowerCase();
    if (normalized == 'preventive') {
      return 'Preventive';
    }
    if (normalized == 'corrective') {
      return 'Corrective';
    }
    if (normalized == 'project') {
      return 'Project';
    }
    return fallback.isNotEmpty ? fallback : code;
  }

  Future<void> pickDate(BuildContext context) async {
    final DateTime initialDate =
        DateTime.tryParse(dateController.text) ?? DateTime.now();

    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );

    if (picked != null) {
      dateController.text = picked.toString().split(' ')[0];
      await generateWoNumber();
    }
  }

  Future<void> pickImages() async {
    try {
      final result = await Get.dialog<String>(
        AlertDialog(
          title: const Text('Tambah Lampiran'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt),
                title: const Text('Ambil Foto'),
                onTap: () => Get.back(result: 'camera'),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: const Text('Pilih dari Galeri'),
                onTap: () => Get.back(result: 'gallery'),
              ),
            ],
          ),
        ),
      );

      if (result == null) {
        return;
      }

      if (result == 'camera') {
        final XFile? photo = await _picker.pickImage(
          source: ImageSource.camera,
          imageQuality: 85,
        );
        if (photo != null) {
          _appendImage(File(photo.path));
        }
        return;
      }

      final images = await _picker.pickMultiImage(imageQuality: 85);
      for (final image in images) {
        if (!_appendImage(File(image.path))) {
          break;
        }
      }
    } catch (e) {
      Get.snackbar(
        'Error',
        'Gagal memilih gambar: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  bool _appendImage(File file) {
    if (selectedImages.length >= 5) {
      Get.snackbar(
        'Limit',
        'Maksimal 5 lampiran',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return false;
    }
    selectedImages.add(file);
    return true;
  }

  void removeImage(int index) {
    if (index >= 0 && index < selectedImages.length) {
      selectedImages.removeAt(index);
    }
  }

  Future<void> showAssetSelectionDialog(BuildContext context) async {
    final selected = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) {
        String searchQuery = '';
        List<Map<String, dynamic>> filteredAssets = assets.toList();

        return StatefulBuilder(
          builder: (context, setState) {
            return Dialog(
              child: Container(
                height: MediaQuery.of(context).size.height * 0.7,
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Pilih Asset',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      onChanged: (value) {
                        setState(() {
                          searchQuery = value;
                          if (searchQuery.isEmpty) {
                            filteredAssets = assets.toList();
                          } else {
                            final query = searchQuery.toLowerCase();
                            filteredAssets = assets.where((asset) {
                              final name = (asset['AssetName'] ?? '')
                                  .toString()
                                  .toLowerCase();
                              final code = (asset['AssetCode'] ?? '')
                                  .toString()
                                  .toLowerCase();
                              final company = (asset['Company'] ??
                                      asset['CompanyName'] ??
                                      '')
                                  .toString()
                                  .toLowerCase();
                              return name.contains(query) ||
                                  code.contains(query) ||
                                  company.contains(query);
                            }).toList();
                          }
                        });
                      },
                      decoration: InputDecoration(
                        hintText: 'Cari Asset Name / Asset Code...',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: searchQuery.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  setState(() {
                                    searchQuery = '';
                                    filteredAssets = assets.toList();
                                  });
                                },
                              )
                            : null,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        '${filteredAssets.length} asset ditemukan',
                        style: TextStyle(
                            color: Colors.grey.shade600, fontSize: 12),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: filteredAssets.isEmpty
                          ? Center(
                              child: Text(
                                'Asset tidak ditemukan',
                                style: TextStyle(color: Colors.grey.shade600),
                              ),
                            )
                          : ListView.builder(
                              itemCount: filteredAssets.length,
                              itemBuilder: (context, index) {
                                final asset = filteredAssets[index];
                                final isSelected =
                                    selectedAsset.value?['AssetID'] ==
                                        asset['AssetID'];
                                return ListTile(
                                  leading: Icon(
                                    Icons.precision_manufacturing,
                                    color: isSelected
                                        ? Colors.teal
                                        : Colors.grey.shade600,
                                  ),
                                  title: Text(
                                    (asset['AssetName'] ?? '-').toString(),
                                    style: TextStyle(
                                      fontWeight: isSelected
                                          ? FontWeight.w700
                                          : FontWeight.w500,
                                    ),
                                  ),
                                  subtitle: Text(
                                      (asset['AssetCode'] ?? '-').toString()),
                                  trailing: isSelected
                                      ? const Icon(
                                          Icons.check_circle,
                                          color: Colors.teal,
                                        )
                                      : null,
                                  selected: isSelected,
                                  onTap: () => Navigator.pop(context, asset),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (selected != null) {
      selectedAsset.value = selected;
    }
  }

  String? validateRequired(String? value, String fieldName) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName wajib diisi';
    }
    return null;
  }

  String? validateNumber(String? value, String fieldName) {
    if (value == null || value.trim().isEmpty) {
      return null;
    }
    if (double.tryParse(value.trim()) == null) {
      return '$fieldName harus angka';
    }
    return null;
  }

  Future<void> submitWo() async {
    if (isSubmitting.value) {
      return;
    }

    if (!formKey.currentState!.validate()) {
      return;
    }

    if (selectedDivision.value == null) {
      Get.snackbar(
        'Validasi',
        'Division user tidak ditemukan',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    if (selectedAsset.value == null) {
      Get.snackbar(
        'Validasi',
        'Pilih Asset/Equipment terlebih dahulu',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    if (selectedTypeWo.value.trim().isEmpty) {
      Get.snackbar(
        'Validasi',
        'Pilih Type WO terlebih dahulu',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    if (selectedPriority.value.trim().isEmpty) {
      Get.snackbar(
        'Validasi',
        'Pilih Priority terlebih dahulu',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    final selectedAssetData = selectedAsset.value!;
    final equipmentId = (selectedAssetData['AssetID'] ??
            selectedAssetData['id_equipment'] ??
            '')
        .toString()
        .trim();
    if (equipmentId.isEmpty) {
      Get.snackbar(
        'Validasi',
        'ID asset tidak valid',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    final company = companyController.text.trim().isNotEmpty
        ? companyController.text.trim()
        : (selectedAssetData['Company'] ??
                selectedAssetData['CompanyName'] ??
                '')
            .toString()
            .trim();
    if (company.isEmpty) {
      Get.snackbar(
        'Validasi',
        'Company belum terisi, pilih asset yang valid',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    try {
      isLoading.value = true;
      isSubmitting.value = true;

      final result = await _woRepository.createWo(
        woNumber: woNumberController.text.contains('Auto')
            ? null
            : woNumberController.text.trim(),
        date: dateController.text.trim(),
        company: company,
        shift: selectedShift.value.trim(),
        typeWo: selectedTypeWo.value.trim(),
        priority: selectedPriority.value.trim(),
        idDivision:
            (selectedDivision.value?['id_division'] ?? '').toString().trim(),
        idEquipment: equipmentId,
        jobTitle: jobTitleController.text.trim(),
        runningHours: runningHoursController.text.trim(),
        jobRequirement: jobRequirementController.text.trim(),
        attachmentPaths: selectedImages.map((file) => file.path).toList(),
      );

      Get.back(result: true);
      Get.snackbar(
        'Sukses',
        result['message']?.toString() ?? 'Work Order berhasil dibuat',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
    } catch (e) {
      Get.snackbar(
        'Error',
        e.toString().replaceAll('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
      isSubmitting.value = false;
    }
  }
}
