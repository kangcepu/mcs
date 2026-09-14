import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:dio/dio.dart' as dio;
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:io';
import '../../../data/repositories/wo_ga_repository.dart';
import '../../../data/repositories/master_repository.dart';

class WoGaCreateController extends GetxController {
  final WoGaRepository _woRepository = WoGaRepository();
  final MasterRepository _masterRepository = MasterRepository();

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
  final selectedShift = ''.obs;

  final companies = <Map<String, dynamic>>[].obs;
  final selectedCompany = Rx<String?>(null);

  final divisions = <Map<String, dynamic>>[].obs;
  final assets = <Map<String, dynamic>>[].obs;
  final woTypes = <Map<String, dynamic>>[].obs;
  final priorities = <Map<String, dynamic>>[].obs;

  final selectedImages = <File>[].obs;
  final ImagePicker _picker = ImagePicker();
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
        final companyRaw = (asset['Company'] ?? asset['CompanyName'] ?? '')
            .toString()
            .trim();
        if (companyRaw.isNotEmpty) {
          final matched = companies.firstWhereOrNull(
            (c) =>
                c['code'].toString().toLowerCase() == companyRaw.toLowerCase() ||
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
      loadCompanies(),
      loadWoTypes(),
      loadPriorities(),
    ]);

    await loadUserDivision();

    isLoadingMaster.value = false;
  }

  Future<void> loadCompanies() async {
    try {
      final result = await _masterRepository.getCompanies();
      companies.value = result;
    } catch (e) {
      print('Error loading companies: $e');
      companies.clear();
    }
  }

  Future<void> loadUserDivision() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final divisionCode = prefs.getString('division_code') ?? '';
      final divisionName = prefs.getString('division_name') ?? '';

      print('Division from SharedPreferences:');
      print(' - division_code: $divisionCode');
      print(' - division_name: $divisionName');

      if (divisionCode.isNotEmpty && divisionName.isNotEmpty) {
        await loadDivisions();

        final matchedDivision = divisions.firstWhereOrNull(
          (div) => div['division_code'] == divisionCode,
        );

        if (matchedDivision != null) {
          selectedDivision.value = matchedDivision;
          print(
            'Division matched: ${matchedDivision['division_name']} (ID: ${matchedDivision['id_division']})',
          );
        } else {
          selectedDivision.value = {
            'division_code': divisionCode,
            'division_name': divisionName,
            'id_division': '',
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

  Future<void> generateWoNumber() async {
    try {
      isGeneratingNumber.value = true;
      final woNumber = await _woRepository.generateWoNumber();
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

  Future<void> loadDivisions() async {
    try {
      final result = await _masterRepository.getDivisions();
      divisions.value = result;
      print('📋 Loaded ${divisions.length} divisions');
    } catch (e) {
      print('Error loading divisions: $e');
    }
  }

  Future<void> loadWoTypes() async {
    try {
      final result = await _masterRepository.getWoTypes();

      print('🔍 WO Types from API:');
      print('   Count: ${result.length}');

      if (result.isNotEmpty) {
        woTypes.value = result;
        for (var i = 0; i < result.length; i++) {
          print(
              '   [$i] code: ${result[i]['code']}, label: ${result[i]['label']}');
        }
      } else {
        print('⚠️ API returned empty, using fallback');
        woTypes.value = [
          {'code': 'CORRECTIVE MAINTENANCE', 'label': 'Corrective Maintenance'},
          {'code': 'PREV MAINTENANCE', 'label': 'Prev. Maintenance'},
          {'code': 'PROJECT', 'label': 'Project'},
        ];
      }
    } catch (e) {
      print('❌ Error loading WO types: $e');
      woTypes.value = [
        {'code': 'CORRECTIVE MAINTENANCE', 'label': 'Corrective Maintenance'},
        {'code': 'PREV MAINTENANCE', 'label': 'Prev. Maintenance'},
        {'code': 'PROJECT', 'label': 'Project'},
      ];
    }
  }

  Future<void> loadPriorities() async {
    try {
      final result = await _masterRepository.getPriorities();

      print('🔍 Priorities from API:');
      print('   Count: ${result.length}');

      if (result.isNotEmpty) {
        priorities.value = result;
        for (var i = 0; i < result.length; i++) {
          print(
              '   [$i] code: ${result[i]['code']}, label: ${result[i]['label']}');
        }
      } else {
        print('⚠️ API returned empty, using fallback');
        priorities.value = [
          {'code': 'NORMAL', 'label': 'Normal'},
          {'code': 'EMERGENCY', 'label': 'Emergency'},
        ];
      }
    } catch (e) {
      print('❌ Error loading priorities: $e');
      priorities.value = [
        {'code': 'NORMAL', 'label': 'Normal'},
        {'code': 'EMERGENCY', 'label': 'Emergency'},
      ];
    }
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
    selectedImages.removeAt(index);
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
        'Division user belum terdeteksi, silakan login ulang',
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

    if (companyController.text.trim().isEmpty) {
      Get.snackbar(
        'Validasi',
        'Pilih Company terlebih dahulu',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
      return;
    }

    try {
      isLoading.value = true;
      isSubmitting.value = true;

      final formData = dio.FormData.fromMap({
        'date': dateController.text,
        'company': companyController.text,
        'shift': selectedShift.value,
        'type_wo': selectedTypeWo.value,
        'priority': selectedPriority.value,
        'id_division': selectedDivision.value!['id_division'],
        'id_equipment': selectedAsset.value!['AssetID'],
        'job_title': jobTitleController.text,
        'running_hours': runningHoursController.text,
        'job_requirement': jobRequirementController.text,
      });

      for (var i = 0; i < selectedImages.length; i++) {
        formData.files.add(MapEntry(
          'attachment[]',
          await dio.MultipartFile.fromFile(
            selectedImages[i].path,
            filename: 'attachment_$i.jpg',
          ),
        ));
      }

      await _woRepository.createWo(formData);

      Get.snackbar(
        'Sukses',
        'Work Order berhasil dibuat',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      Get.back(result: true);
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

