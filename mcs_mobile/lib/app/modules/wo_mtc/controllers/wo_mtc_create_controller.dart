import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:io';
import 'dart:convert';
import '../../../data/repositories/wo_mtc_repository.dart';
import '../../../data/repositories/master_repository.dart';
import '../../../data/models/create_wo_request.dart';
import '../../../data/models/wo_constants.dart';

class WoMtcCreateController extends GetxController {
  final WoMtcRepository _woMtcRepository = WoMtcRepository();
  final MasterRepository _masterRepository = MasterRepository();

  final formKey = GlobalKey<FormState>();

  final woNumberController = TextEditingController();
  final dateController = TextEditingController();
  final companyController = TextEditingController();
  final shiftController = TextEditingController();
  final jobTitleController = TextEditingController();
  final runningHoursController = TextEditingController();
  final jobRequirementController = TextEditingController();

  final isLoading = false.obs;
  final isLoadingMaster = true.obs;
  final isGeneratingNumber = false.obs;
  final isSubmitting = false.obs;
  final selectedDivision = Rx<Map<String, dynamic>?>(null);
  final selectedAsset = Rx<Map<String, dynamic>?>(null);
  final selectedTypeWo = Rx<WoType?>(null);
  final selectedPriority = Rx<WoPriority?>(null);

  final divisions = <Map<String, dynamic>>[].obs;
  final assets = <Map<String, dynamic>>[].obs;
  final woTypes = <Map<String, dynamic>>[].obs;
  final priorities = <Map<String, dynamic>>[].obs;
  final companies = <Map<String, dynamic>>[].obs;
  final selectedCompany = Rx<String?>(null);

  final selectedImages = <File>[].obs;
  final ImagePicker _picker = ImagePicker();
  Map<String, dynamic>? _prefillAsset;

  @override
  void onInit() {
    super.onInit();
    dateController.text = DateTime.now().toString().split(' ')[0];

    final args = Get.arguments;
    if (args is Map && args['prefill_asset'] != null) {
      _prefillAsset = _normalizeAssetMap(args['prefill_asset']);
    }

    ever(selectedAsset, (asset) {
      if (asset != null) {
        final companyRaw =
            (asset['Company'] ?? asset['CompanyName'] ?? '').toString().trim();
        if (companyRaw.isNotEmpty) {
          // Try to match by code first, then by label
          final matched = companies.firstWhereOrNull(
            (c) =>
                c['code'].toString().toLowerCase() ==
                    companyRaw.toLowerCase() ||
                c['label'].toString().toLowerCase() == companyRaw.toLowerCase(),
          );
          final companyLabel = matched?['label']?.toString() ?? companyRaw;
          selectedCompany.value = companyLabel;
          companyController.text = companyLabel;
        }
      }
    });

    loadMasterDataThenUserDivision();
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

  Future<void> loadMasterDataThenUserDivision() async {
    isLoadingMaster.value = true;

    await Future.wait([
      loadWoTypes(),
      loadPriorities(),
      loadCompanies(),
    ]);

    if (woTypes.isNotEmpty && selectedTypeWo.value == null) {
      final firstType = WoType.fromCode(woTypes[0]['code']);
      if (firstType != null) {
        selectedTypeWo.value = firstType;
      }
    }

    if (priorities.isNotEmpty && selectedPriority.value == null) {
      final firstPriority = WoPriority.fromCode(priorities[0]['code']);
      if (firstPriority != null) {
        selectedPriority.value = firstPriority;
      }
    }

    await loadUserDivision();

    isLoadingMaster.value = false;
  }

  Future<void> loadUserDivision() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final divisionCode = prefs.getString('division_code') ?? '';
      final divisionName = prefs.getString('division_name') ?? '';
      final idDivision = prefs.getString('id_division') ??
          prefs.getString('division_id') ??
          '';

      print('Division from SharedPreferences:');
      print('   - division_code: $divisionCode');
      print('   - division_name: $divisionName');
      print('   - id_division: $idDivision');

      if (divisionCode.isNotEmpty && divisionName.isNotEmpty) {
        await loadDivisions();

        final matchedDivision = divisions.firstWhereOrNull(
          (div) => div['division_code'] == divisionCode,
        );

        if (matchedDivision != null) {
          selectedDivision.value = matchedDivision;
          print(
              'Division matched: ${matchedDivision['division_name']} (ID: ${matchedDivision['id_division']})');
        } else {
          print('No matching division found in master data');
          selectedDivision.value = {
            'division_code': divisionCode,
            'division_name': divisionName,
            'id_division': idDivision,
          };
        }
      }

      await loadAssets();
      _applyPrefillAssetIfNeeded();
      await generateWoNumber();
      print('Assets loaded: ${assets.length} items');
    } catch (e) {
      print('Error loading user division: $e');
      await loadAssets();
      _applyPrefillAssetIfNeeded();
      await generateWoNumber();
    }
  }

  @override
  void onClose() {
    woNumberController.dispose();
    dateController.dispose();
    companyController.dispose();
    shiftController.dispose();
    jobTitleController.dispose();
    runningHoursController.dispose();
    jobRequirementController.dispose();
    super.onClose();
  }

  Future<void> generateWoNumber() async {
    try {
      isGeneratingNumber.value = true;
      final woNumber = await _woMtcRepository.generateWoNumber();
      woNumberController.text = woNumber;
      print('Generated WO Number: $woNumber');
    } catch (e) {
      print('Error generating WO number: $e');
      woNumberController.text = '(Auto Generate)';
      Get.snackbar(
        'Info',
        'WO Number akan di-generate otomatis saat submit',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.blue,
        colorText: Colors.white,
      );
    } finally {
      isGeneratingNumber.value = false;
    }
  }

  Future<void> loadDivisions() async {
    try {
      final result = await _masterRepository.getDivisions();
      divisions.value = result;
      print('Loaded ${divisions.length} divisions');
    } catch (e) {
      print('Error loading divisions: $e');
    }
  }

  Future<void> loadWoTypes() async {
    woTypes.value = [
      {'code': 'CORRECTIVE', 'label': 'Corrective'},
      {'code': 'PREVENTIVE', 'label': 'Preventive'},
      {'code': 'PROJECT', 'label': 'Project'},
    ];
    print('Loaded ${woTypes.length} WO types');
  }

  Future<void> loadPriorities() async {
    priorities.value = [
      {'code': 'NORMAL', 'label': 'Normal'},
      {'code': 'EMERGENCY', 'label': 'Emergency'},
    ];
    print('Loaded ${priorities.length} priorities');
  }

  Future<void> loadCompanies() async {
    companies.value = [
      {'code': 'GSU', 'label': 'Ganda Saribu Utama'},
      {'code': 'RU', 'label': 'Ratimdo Utama'},
      {'code': 'UC', 'label': 'Utama Corporation'},
    ];
    print('Loaded ${companies.length} companies');
  }

  Future<void> loadAssets() async {
    try {
      final result = await _masterRepository.getAssets();
      assets.value = result;
    } catch (e) {
      print('Error loading assets: $e');
    }
  }

  Future<void> pickDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );

    if (picked != null) {
      dateController.text = picked.toString().split(' ')[0];
    }
  }

  Future<void> pickImages() async {
    try {
      final result = await Get.dialog<String>(
        AlertDialog(
          title: const Text('Add Photo'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt),
                title: const Text('Take Photo'),
                onTap: () => Get.back(result: 'camera'),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: const Text('Choose from Gallery'),
                onTap: () => Get.back(result: 'gallery'),
              ),
            ],
          ),
        ),
      );

      if (result == null) return;

      if (result == 'camera') {
        final XFile? photo =
            await _picker.pickImage(source: ImageSource.camera);
        if (photo != null) {
          if (selectedImages.length < 5) {
            selectedImages.add(File(photo.path));
          } else {
            Get.snackbar(
              'Limit Reached',
              'Maximum 5 photos',
              snackPosition: SnackPosition.BOTTOM,
              backgroundColor: Colors.orange,
              colorText: Colors.white,
            );
          }
        }
      } else if (result == 'gallery') {
        final List<XFile> images = await _picker.pickMultiImage();

        if (images.isNotEmpty) {
          for (var image in images) {
            if (selectedImages.length < 5) {
              selectedImages.add(File(image.path));
            } else {
              Get.snackbar(
                'Limit Reached',
                'Maximum 5 photos',
                snackPosition: SnackPosition.BOTTOM,
                backgroundColor: Colors.orange,
                colorText: Colors.white,
              );
              break;
            }
          }
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

  void removeImage(int index) {
    if (index >= 0 && index < selectedImages.length) {
      selectedImages.removeAt(index);
    }
  }

  Future<List<AttachmentFile>> _prepareAttachments() async {
    final attachments = <AttachmentFile>[];

    for (var file in selectedImages) {
      try {
        final bytes = await file.readAsBytes();
        final base64String = base64Encode(bytes);
        attachments.add(AttachmentFile.fromFile(file, base64String));
      } catch (e) {
        print('Error encoding file ${file.path}: $e');
      }
    }

    return attachments;
  }

  Future<void> submitWo() async {
    if (isSubmitting.value) return;

    if (!formKey.currentState!.validate()) {
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

    if (selectedTypeWo.value == null) {
      Get.snackbar(
        'Validasi',
        'Pilih Type WO terlebih dahulu',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    if (selectedPriority.value == null) {
      Get.snackbar(
        'Validasi',
        'Pilih Priority terlebih dahulu',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    try {
      isLoading.value = true;
      isSubmitting.value = true;

      final attachments = await _prepareAttachments();

      final request = CreateWoRequest(
        woNumber: woNumberController.text.contains('Auto')
            ? null
            : woNumberController.text,
        date: dateController.text,
        idEquipment: selectedAsset.value!['AssetID'],
        company: selectedCompany.value ?? companyController.text,
        shift: shiftController.text.isNotEmpty ? shiftController.text : null,
        jobTitle: jobTitleController.text,
        typeWo: selectedTypeWo.value!.code,
        priority: selectedPriority.value!.code,
        runningHours: runningHoursController.text.isNotEmpty
            ? runningHoursController.text
            : null,
        jobRequirement: jobRequirementController.text,
        attachments: attachments.isNotEmpty ? attachments : null,
      );

      final result = await _woMtcRepository.createWo(request);

      Get.back(result: true);

      Get.snackbar(
        'Sukses',
        result['message'] ?? 'Work Order berhasil dibuat',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
        icon: const Icon(Icons.check_circle, color: Colors.white),
      );
    } catch (e) {
      print('Submit WO Error: $e');
      Get.snackbar(
        'Error',
        e.toString().replaceAll('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
        icon: const Icon(Icons.error, color: Colors.white),
        duration: const Duration(seconds: 4),
      );
    } finally {
      isLoading.value = false;
      isSubmitting.value = false;
    }
  }

  String? validateRequired(String? value, String fieldName) {
    if (value == null || value.isEmpty) {
      return '$fieldName harus diisi';
    }
    return null;
  }

  String? validateNumber(String? value, String fieldName) {
    if (value == null || value.isEmpty) {
      return null;
    }
    if (double.tryParse(value) == null) {
      return '$fieldName harus berupa angka';
    }
    return null;
  }

  Widget _buildAssetField(WoMtcCreateController controller) {
    return Obx(() {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Asset/Equipment *',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Builder(builder: (context) {
            return InkWell(
              onTap: () => controller.showAssetSelectionDialog(context),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade400),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.precision_manufacturing, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        controller.selectedAsset.value?['AssetName'] ??
                            'Select Asset',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 16,
                          color: controller.selectedAsset.value != null
                              ? Colors.black
                              : Colors.grey.shade600,
                        ),
                      ),
                    ),
                    Icon(Icons.arrow_drop_down, color: Colors.grey.shade600),
                  ],
                ),
              ),
            );
          }),
        ],
      );
    });
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
                        const Text('Select Asset',
                            style: TextStyle(
                                fontSize: 18, fontWeight: FontWeight.bold)),
                        IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.pop(context)),
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
                              return name.contains(query) ||
                                  code.contains(query);
                            }).toList();
                          }
                        });
                      },
                      decoration: InputDecoration(
                        hintText: 'Search asset name or code...',
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
                            borderRadius: BorderRadius.circular(8)),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text('${filteredAssets.length} assets found',
                          style:
                              TextStyle(color: Colors.grey[600], fontSize: 12)),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: filteredAssets.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.search_off,
                                      size: 48, color: Colors.grey[400]),
                                  const SizedBox(height: 16),
                                  Text('No assets found',
                                      style:
                                          TextStyle(color: Colors.grey[600])),
                                ],
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
                                  leading: Icon(Icons.precision_manufacturing,
                                      color: isSelected
                                          ? Colors.orange
                                          : Colors.grey),
                                  title: Text(asset['AssetName'] ?? '',
                                      style: TextStyle(
                                          fontWeight: isSelected
                                              ? FontWeight.bold
                                              : FontWeight.normal)),
                                  subtitle: asset['AssetCode'] != null
                                      ? Text(asset['AssetCode'])
                                      : null,
                                  trailing: isSelected
                                      ? const Icon(Icons.check_circle,
                                          color: Colors.orange)
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
}
